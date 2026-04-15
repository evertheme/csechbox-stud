/**
 * Waiting-room socket handler.
 *
 * Covers the full lifecycle of a friendly game's waiting room:
 *   create-room  →  get-room  →  player-ready  →  start-game
 *                                leave-room / disconnect (any time)
 *
 * Event contract
 * ──────────────
 * Client → Server
 *   create-room    WaitingRoomCreateConfig
 *   get-room       { roomId }
 *   player-ready   { roomId, isReady }
 *   leave-room     { roomId }
 *   start-game     { roomId }
 *
 * Server → Client (targeted)
 *   room-created        { roomId }          → creator only
 *   create-room-error   { message }         → creator only
 *   room-state          WaitingRoomSnapshot → requesting socket only
 *
 * Server → Client (broadcast to socket.io room)
 *   player-joined  { player }
 *   player-left    { userId }
 *   player-ready   { userId, isReady }
 *   game-started   { roomId }
 *   host-changed   { hostId }
 *   room-closed    {}
 */

import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  WaitingRoomCreateConfig,
} from "@poker/shared-types";
import { GameEngine, GAME_REGISTRY } from "@poker/game-engine";
import type { GameType } from "@poker/game-engine";
import { GameRoomManager } from "../../game/game-room-manager.js";
import { getSupabase } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import { setupGameEngineListeners } from "./game-handler.js";

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ─── Game-type helpers ────────────────────────────────────────────────────────

/**
 * Map the string stored in `WaitingRoom.gameType` (sent from the client) to a
 * `GameRules` object from the game-engine registry.
 *
 * Falls back to Five-Card Stud so the engine always has a valid rule set even
 * when an unrecognised ID slips through.
 */
const KNOWN_GAME_TYPES = new Set<string>([
  "five-card-stud",
  "five-card-stud-low",
  "five-card-stud-high-low",
  "seven-card-stud",
  "razz",
  "seven-card-stud-high-low",
]);

function gameTypeToRules(gameType: string) {
  const id: GameType = KNOWN_GAME_TYPES.has(gameType)
    ? (gameType as GameType)
    : "five-card-stud";
  return GAME_REGISTRY[id];
}

// ─── Config validation ────────────────────────────────────────────────────────

const BUY_IN_MIN = 100;
const BUY_IN_MAX = 10_000;
const MAX_PLAYERS_MIN = 2;
const MAX_PLAYERS_MAX = 7;

function validateConfig(
  config: WaitingRoomCreateConfig,
): string | null {
  if (!config.gameType || typeof config.gameType !== "string") {
    return "gameType is required.";
  }
  if (
    typeof config.startingBuyIn !== "number" ||
    config.startingBuyIn < BUY_IN_MIN ||
    config.startingBuyIn > BUY_IN_MAX
  ) {
    return `startingBuyIn must be between $${BUY_IN_MIN} and $${BUY_IN_MAX.toLocaleString()}.`;
  }
  if (
    typeof config.maxPlayers !== "number" ||
    config.maxPlayers < MAX_PLAYERS_MIN ||
    config.maxPlayers > MAX_PLAYERS_MAX
  ) {
    return `maxPlayers must be between ${MAX_PLAYERS_MIN} and ${MAX_PLAYERS_MAX}.`;
  }
  return null;
}

// ─── Handler registration ─────────────────────────────────────────────────────

export function registerWaitingRoomHandlers(
  io: IoServer,
  socket: IoSocket,
): void {
  const manager = GameRoomManager.getInstance();

  // Convenience: auth fields are read once at registration time.
  // They are stable for the lifetime of the socket connection.
  const authedUser = socket.data.user;

  // ── Shared leave/cleanup logic ─────────────────────────────────────────────

  async function handleLeave(roomId: string): Promise<void> {
    const userId = authedUser?.id;
    if (!userId) return;

    const { removed, room, hostChanged } = manager.removePlayer(roomId, userId);
    if (!removed || !room) return;

    await socket.leave(roomId);
    delete socket.data.roomId;

    if (room.players.length === 0) {
      // Last player out — purge and done (no one left to notify).
      manager.deleteRoom(roomId);
      logger.info(`Room ${roomId} closed (empty).`);
      return;
    }

    // Notify remaining players.
    io.to(roomId).emit("player-left", { userId });

    if (hostChanged) {
      io.to(roomId).emit("host-changed", { hostId: room.hostId });
      logger.info(`Host transferred to ${room.hostId} in room ${roomId}.`);
    }

    logger.info(`${authedUser?.username ?? userId} left room ${roomId}.`);
  }

  // ── create-room ────────────────────────────────────────────────────────────
  //
  // Creates an in-memory room, persists a games row to Supabase (non-blocking
  // on DB failure — the game still runs in memory), adds the creator as the
  // first seated player, and fires `room-created` back to the creator.

  socket.on("create-room", async (config) => {
    const userId = authedUser?.id;
    const username = authedUser?.username;

    if (!userId || !username) {
      socket.emit("create-room-error", { message: "Not authenticated." });
      return;
    }

    const validationError = validateConfig(config);
    if (validationError) {
      socket.emit("create-room-error", { message: validationError });
      return;
    }

    // Normalise rebuy values — fall back to auto-calculated if not provided.
    const minRebuy =
      typeof config.minRebuy === "number"
        ? config.minRebuy
        : Math.round(config.startingBuyIn * 0.5);
    const maxRebuy =
      typeof config.maxRebuy === "number"
        ? config.maxRebuy
        : Math.round(config.startingBuyIn * 2);

    // 1. Create in-memory room.
    const room = manager.createRoom({
      gameType: config.gameType,
      maxPlayers: config.maxPlayers,
      startingBuyIn: config.startingBuyIn,
      minRebuy,
      maxRebuy,
      createdBy: userId,
    });

    // 2. Persist to Supabase — failure is non-fatal.
    const supabase = getSupabase();
    if (supabase) {
      const { error: dbError } = await supabase.from("games").insert({
        id: room.id,
        game_type: config.gameType,
        stakes: { ante: 1, bringIn: 2 },
        starting_buy_in: config.startingBuyIn,
        min_rebuy: minRebuy,
        max_rebuy: maxRebuy,
        max_players: config.maxPlayers,
        created_by: userId,
        status: "waiting",
        session_date: new Date().toISOString().split("T")[0],
      });

      if (dbError) {
        logger.warn(
          `[room-handler] DB insert failed for room ${room.id}: ${dbError.message}`,
        );
      }
    }

    // 3. Add the creator as the first player.
    manager.addPlayer(room.id, {
      userId,
      username,
      chips: config.startingBuyIn,
      socketId: socket.id,
      isReady: false,
      isHost: true,
    });

    // 4. Join the socket.io room.
    await socket.join(room.id);
    socket.data.roomId = room.id;

    // 5. Notify the creator.
    socket.emit("room-created", { roomId: room.id });

    logger.info(
      `Room ${room.id} created by ${username} (${config.gameType}, buy-in: $${config.startingBuyIn}).`,
    );
  });

  // ── get-room ───────────────────────────────────────────────────────────────
  //
  // Serves a full room-state snapshot to the requesting socket.
  // If the caller is not yet a room member (i.e. a new player navigating to
  // the game-room screen), they are added automatically and all other players
  // receive a `player-joined` broadcast.

  socket.on("get-room", async ({ roomId }) => {
    const userId = authedUser?.id;
    const username = authedUser?.username;

    const room = manager.getRoom(roomId);
    if (!room) {
      socket.emit("error", `Room ${roomId} not found.`);
      return;
    }

    if (room.status === "playing" || room.status === "finished") {
      socket.emit("error", "That game is already in progress.");
      return;
    }

    const alreadyMember = userId
      ? manager.isPlayerInRoom(roomId, userId)
      : false;

    if (alreadyMember && userId) {
      // Reconnection — update the socket mapping so disconnect handling works.
      manager.updateSocketId(roomId, userId, socket.id);
    } else {
      // New player joining the waiting room.
      if (!userId || !username) {
        socket.emit("error", "Not authenticated.");
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        socket.emit("error", "Room is full.");
        return;
      }

      const player = manager.addPlayer(room.id, {
        userId,
        username,
        chips: room.startingBuyIn,
        socketId: socket.id,
        isReady: false,
        isHost: false,
      });

      if (!player) {
        socket.emit("error", "Could not join room.");
        return;
      }

      // Tell all other members about the new arrival.
      socket
        .to(roomId)
        .emit("player-joined", {
          player: {
            userId: player.userId,
            username: player.username,
            chips: player.chips,
            isReady: player.isReady,
            seatIndex: player.seatIndex,
          },
        });

      logger.info(`${username} joined room ${roomId}.`);
    }

    // Ensure the socket is inside the socket.io room.
    if (!socket.rooms.has(roomId)) {
      await socket.join(roomId);
      socket.data.roomId = roomId;
    }

    // Deliver the full snapshot.
    socket.emit("room-state", manager.snapshot(room));
  });

  // ── player-ready ───────────────────────────────────────────────────────────

  socket.on("player-ready", ({ roomId, isReady }) => {
    const userId = authedUser?.id;
    if (!userId) return;

    const updated = manager.setPlayerReady(roomId, userId, isReady);
    if (!updated) return;

    io.to(roomId).emit("player-ready", { userId, isReady });
  });

  // ── leave-room ─────────────────────────────────────────────────────────────

  socket.on("leave-room", async ({ roomId }) => {
    await handleLeave(roomId);
  });

  // ── start-game ─────────────────────────────────────────────────────────────
  //
  // Host-only.  Validates that ≥ 2 players are all ready before firing
  // `game-started` to the entire room.

  socket.on("start-game", ({ roomId }) => {
    const userId = authedUser?.id;
    if (!userId) return;

    const room = manager.getRoom(roomId);
    if (!room) return;

    if (room.hostId !== userId) {
      socket.emit("error", "Only the host can start the game.");
      return;
    }

    if (room.players.length < 2) {
      socket.emit("error", "At least 2 players are required to start.");
      return;
    }

    const allReady = room.players.every((p) => p.isReady);
    if (!allReady) {
      socket.emit("error", "All players must be ready before starting.");
      return;
    }

    manager.setStatus(roomId, "playing");
    manager.incrementHandNumber(roomId);

    // ── Create and start the GameEngine for the first hand ──────────────────

    const rules = gameTypeToRules(room.gameType);
    const playerIds = room.players.map((p) => p.userId);

    const engine = new GameEngine(rules, playerIds, {
      startingChips: room.startingBuyIn,
      // Ante is the fixed $1 bring-in for all game variants.
      anteAmount: rules.anteRequired ? 1 : 0,
      turnTimeoutSeconds: 40,
      handNumber: room.currentHandNumber,
    });

    manager.setGameEngine(roomId, engine);
    setupGameEngineListeners(roomId, engine, io, manager);

    engine.start();
    engine.dealCards();

    io.to(roomId).emit("game-started", { roomId });

    logger.info(
      `Game started in room ${roomId} by host ${authedUser?.username ?? userId} (${room.gameType}, hand #${room.currentHandNumber}).`,
    );
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  //
  // When a socket disconnects unexpectedly (network drop, app close, etc.) we
  // look up the room via the socketId index and run the same leave logic.

  socket.on("disconnect", async () => {
    const room = manager.getRoomBySocketId(socket.id);
    if (room) {
      await handleLeave(room.id);
    }
  });
}
