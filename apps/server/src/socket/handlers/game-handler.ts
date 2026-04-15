/**
 * In-game event handler.
 *
 * This module is responsible for the active-hand lifecycle that begins once
 * `start-game` fires and the `GameEngine` is running:
 *
 *   - Forwarding turn-timer events to every player in the room.
 *   - Delivering personal warnings to the player whose turn is expiring.
 *   - Persisting timeouts to the `timeout_history` and `game_sessions` tables.
 *   - Marking timed-out players for automatic sit-out after the hand ends.
 *   - Processing pending sit-outs when a hand completes.
 *   - Auto-removing sitting-out players and ending the game session when only
 *     the host remains as an active player.
 *
 * ── How to use ──────────────────────────────────────────────────────────────
 *
 *   In your `start-game` handler (room-handler.ts), after creating the engine:
 *
 *     const engine = new GameEngine(rules, playerIds, { ... });
 *     manager.setGameEngine(roomId, engine);
 *     setupGameEngineListeners(roomId, engine, io, manager);
 *     engine.start();
 *     engine.dealCards();
 */

import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@poker/shared-types";
import type { GameEngine, PlayerTimeoutPayload } from "@poker/game-engine";
import { getSupabase } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import type { GameRoomManager, WaitingPlayer } from "../../game/game-room-manager.js";

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attach listeners on `engine` for a single hand.
 *
 * Call this once per hand immediately after creating the `GameEngine` and
 * before calling `engine.start()`.  The listeners are automatically cleaned up
 * by `engine.destroy()` when the hand ends or when `GameRoomManager.deleteRoom`
 * is called.
 */
export function setupGameEngineListeners(
  roomId: string,
  engine: GameEngine,
  io: IoServer,
  manager: GameRoomManager,
): void {
  // ── TURN TIMER STARTED ────────────────────────────────────────────────────

  engine.on("turn-timer-started", ({ playerId, timeoutSeconds, startTime }) => {
    io.to(roomId).emit("turn-timer-started", {
      playerId,
      timeoutSeconds,
      startTime,
    });
  });

  // ── TURN TIMER WARNING ────────────────────────────────────────────────────

  engine.on("turn-timer-warning", ({ playerId, secondsRemaining }) => {
    // Broadcast to the whole room so opponents can see the warning indicator.
    io.to(roomId).emit("turn-timer-warning", { playerId, secondsRemaining });

    // Send a personalised prompt to the player whose turn is expiring.
    const room = manager.getRoom(roomId);
    const player = room?.players.find((p) => p.userId === playerId);
    if (player?.socketId) {
      io.to(player.socketId).emit("your-turn-warning", { secondsRemaining });
    }
  });

  // ── PLAYER TIMEOUT ────────────────────────────────────────────────────────

  engine.on("player-timeout", (payload) => {
    handlePlayerTimeout(roomId, payload, io, manager).catch((err) => {
      logger.error(`[game-handler] player-timeout error in room ${roomId}:`, err);
    });
  });

  // ── GAME COMPLETE (= hand complete) ───────────────────────────────────────
  //
  // The GameEngine drives a single hand.  "game-complete" fires at the end of
  // that hand — equivalent to "hand-complete" in multi-hand terminology.

  engine.on("game-complete", (_result, _state) => {
    handleHandComplete(roomId, io, manager).catch((err) => {
      logger.error(`[game-handler] game-complete error in room ${roomId}:`, err);
    });
  });
}

// ─── Private: timeout handling ────────────────────────────────────────────────

async function handlePlayerTimeout(
  roomId: string,
  payload: PlayerTimeoutPayload,
  io: IoServer,
  manager: GameRoomManager,
): Promise<void> {
  const { playerId, chipsForfeited, potSize, currentBet, street, handNumber, autoSitOut } =
    payload;

  const room = manager.getRoom(roomId);
  const player = room?.players.find((p) => p.userId === playerId);
  if (!player) return;

  // 1. Set state synchronously BEFORE any awaits so that when game-complete
  //    fires in the same tick (2-player fold path), pendingSitOut is already
  //    true and handleHandComplete will process it correctly.
  player.pendingSitOut = true;
  player.sitOutReason = "timeout";

  // 2. Broadcast synchronously — clients should see the fold immediately.
  io.to(roomId).emit("player-timed-out", {
    playerId,
    username: player.username,
    chipsForfeited,
    action: "fold",
  });

  const now = new Date().toISOString();

  // 3. Persist to timeout_history (async, non-blocking).
  await persistTimeoutRecord({
    roomId,
    playerId,
    now,
    handNumber,
    chipsForfeited,
    potSize,
    currentBet,
    street: street ?? null,
    autoSitOut,
  });

  // 4. Increment timeout_count + last_timeout_at on game_sessions.
  await incrementTimeoutCount(roomId, playerId, now);

  logger.info(
    `[game-handler] Player ${player.username} (${playerId}) timed out in room ${roomId} — pending sit-out.`,
  );
}

// ─── Private: post-hand processing ───────────────────────────────────────────

async function handleHandComplete(
  roomId: string,
  io: IoServer,
  manager: GameRoomManager,
): Promise<void> {
  const room = manager.getRoom(roomId);
  if (!room) return;

  manager.incrementHandNumber(roomId);
  const handNumber = room.currentHandNumber;

  // Process every player that was flagged during the hand.
  for (const player of room.players) {
    if (!player.pendingSitOut) continue;

    await processSitOut(roomId, player, handNumber, io, manager);
  }

  // Check whether only the creator is left and end the game if so.
  await checkAndHandleAutoRemoval(roomId, io, manager);
}

async function processSitOut(
  roomId: string,
  player: WaitingPlayer,
  handNumber: number,
  io: IoServer,
  _manager: GameRoomManager,
): Promise<void> {
  player.isSittingOut = true;
  player.satOutAt = new Date();
  player.handNumberWhenSatOut = handNumber;
  player.chipsWhenSatOut = player.chips;
  player.pendingSitOut = false;

  const reason = player.sitOutReason ?? "player_choice";
  const automatic = reason === "timeout";
  const now = new Date().toISOString();

  // Update the session record.
  // NOTE: is_sitting_out / sit_out_count require a future migration; we
  // increment auto_sat_out_count for timeout-driven sit-outs using the
  // existing schema from 20260415010000_timeouts.sql.
  const supabase = getSupabase();
  if (supabase && automatic) {
    const { data: session } = await supabase
      .from("game_sessions")
      .select("auto_sat_out_count")
      .eq("game_id", roomId)
      .eq("user_id", player.userId)
      .single();

    if (session) {
      await supabase
        .from("game_sessions")
        .update({
          auto_sat_out_count: (session.auto_sat_out_count as number ?? 0) + 1,
          last_timeout_at: now,
        })
        .eq("game_id", roomId)
        .eq("user_id", player.userId);
    }
  }

  // Broadcast sit-out status to the room.
  io.to(roomId).emit("player-sat-out", {
    playerId: player.userId,
    username: player.username,
    chips: player.chips,
    reason,
    automatic,
  });

  logger.info(
    `[game-handler] Player ${player.username} sat out in room ${roomId} (reason: ${reason}).`,
  );
}

// ─── Private: auto-removal check ─────────────────────────────────────────────

/**
 * If all non-host players are sitting out, auto-remove them and end the game.
 * The host is considered the only "active" player in this scenario.
 */
async function checkAndHandleAutoRemoval(
  roomId: string,
  io: IoServer,
  manager: GameRoomManager,
): Promise<void> {
  const room = manager.getRoom(roomId);
  if (!room || room.status !== "playing") return;

  const active = room.players.filter((p) => !p.isSittingOut);
  const sittingOut = room.players.filter((p) => p.isSittingOut);

  const onlyHostActive =
    active.length === 1 && active[0]!.isHost && sittingOut.length > 0;

  if (!onlyHostActive) return;

  logger.info(
    `[game-handler] Only host remains in room ${roomId} — auto-removing ${sittingOut.length} sitting-out player(s).`,
  );

  for (const player of sittingOut) {
    await autoRemoveSittingOutPlayer(roomId, player.userId, io, manager);
  }

  io.to(roomId).emit("game-ended", {
    reason: "Only the host remains — all other players have sat out.",
    autoEnded: true,
  });

  await endGame(roomId, io, manager);
}

async function autoRemoveSittingOutPlayer(
  roomId: string,
  playerId: string,
  io: IoServer,
  manager: GameRoomManager,
): Promise<void> {
  const room = manager.getRoom(roomId);
  const player = room?.players.find((p) => p.userId === playerId);
  if (!player) return;

  const finalChips = player.chips;
  const netProfit = finalChips - (player.totalBuyIn ?? finalChips);
  const now = new Date().toISOString();

  // Close out the player's session record.
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("game_sessions")
      .update({
        left_at: now,
        is_active: false,
        final_chips: finalChips,
        net_profit: netProfit,
      })
      .eq("game_id", roomId)
      .eq("user_id", playerId);

    if (error) {
      logger.warn(
        `[game-handler] Could not close session for player ${playerId} in room ${roomId}: ${error.message}`,
      );
    }
  }

  // Notify the player personally that they were removed.
  const playerSocket = room?.players.find((p) => p.userId === playerId)?.socketId;
  if (playerSocket) {
    io.to(playerSocket).emit("player-left", { userId: playerId });
  }

  // Remove from in-memory room and notify remaining players.
  manager.removePlayer(roomId, playerId);
  io.to(roomId).emit("player-left", { userId: playerId });

  logger.info(
    `[game-handler] Player ${player.username} auto-removed from room ${roomId} (net: ${netProfit > 0 ? "+" : ""}${netProfit}).`,
  );
}

async function endGame(
  roomId: string,
  _io: IoServer,
  _manager: GameRoomManager,
): Promise<void> {
  _manager.setStatus(roomId, "finished");

  // Destroy the active game engine if one is still attached.
  _manager.removeGameEngine(roomId);

  // Mark the games row as complete.
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("games")
      .update({ status: "finished" })
      .eq("id", roomId);

    if (error) {
      logger.warn(
        `[game-handler] Could not update game status for room ${roomId}: ${error.message}`,
      );
    }
  }

  logger.info(`[game-handler] Game session ended for room ${roomId}.`);
}

// ─── Private: DB helpers ──────────────────────────────────────────────────────

interface TimeoutRecordArgs {
  roomId: string;
  playerId: string;
  now: string;
  handNumber: number;
  chipsForfeited: number;
  potSize: number;
  currentBet: number;
  street: string | null;
  autoSitOut: boolean;
}

async function persistTimeoutRecord(args: TimeoutRecordArgs): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from("timeout_history").insert({
    game_id: args.roomId,
    user_id: args.playerId,
    timed_out_at: args.now,
    hand_number: args.handNumber,
    chips_forfeited: args.chipsForfeited,
    pot_size_at_timeout: args.potSize,
    current_bet: args.currentBet,
    street: args.street,
    auto_sat_out: args.autoSitOut,
  });

  if (error) {
    logger.warn(
      `[game-handler] timeout_history insert failed for player ${args.playerId}: ${error.message}`,
    );
  }
}

async function incrementTimeoutCount(
  roomId: string,
  playerId: string,
  now: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // Read the current count then write the incremented value.
  // Supabase JS v2 does not support SQL expression updates natively, so
  // we use a read-then-write pattern.  Timeouts for a single player are
  // sequential, so there is no meaningful concurrency risk here.
  const { data, error: readError } = await supabase
    .from("game_sessions")
    .select("timeout_count")
    .eq("game_id", roomId)
    .eq("user_id", playerId)
    .single();

  if (readError || !data) {
    logger.warn(
      `[game-handler] Could not read timeout_count for player ${playerId}: ${readError?.message ?? "not found"}`,
    );
    return;
  }

  const { error: writeError } = await supabase
    .from("game_sessions")
    .update({
      timeout_count: (data.timeout_count as number ?? 0) + 1,
      last_timeout_at: now,
    })
    .eq("game_id", roomId)
    .eq("user_id", playerId);

  if (writeError) {
    logger.warn(
      `[game-handler] Could not update timeout_count for player ${playerId}: ${writeError.message}`,
    );
  }
}
