import { v4 as uuidv4 } from "uuid";
import type { WaitingPlayerSnapshot, WaitingRoomSnapshot } from "@poker/shared-types";

// ─── Internal types ───────────────────────────────────────────────────────────

export interface WaitingPlayer extends WaitingPlayerSnapshot {
  socketId: string;
  isHost: boolean;
}

export interface WaitingRoomConfig {
  gameType: string;
  maxPlayers: number;
  startingBuyIn: number;
  minRebuy: number;
  maxRebuy: number;
  createdBy: string;
}

export interface WaitingRoom {
  id: string;
  gameType: string;
  hostId: string;
  maxPlayers: number;
  startingBuyIn: number;
  minRebuy: number;
  maxRebuy: number;
  stakes: { ante: 1; bringIn: 2 };
  allowRebuys: boolean;
  rebuyTimeoutSeconds: number;
  players: WaitingPlayer[];
  status: "waiting" | "playing" | "finished";
  createdAt: Date;
}

export type AddPlayerArgs = Omit<WaitingPlayer, "seatIndex">;

// ─── GameRoomManager ──────────────────────────────────────────────────────────

/**
 * Singleton in-memory store for waiting-room state.
 *
 * Lifecycle
 * ─────────
 *   1. createRoom()       – host creates a room, gets back a WaitingRoom.
 *   2. addPlayer()        – host + each joining player register themselves.
 *   3. setPlayerReady()   – players mark themselves ready.
 *   4. setStatus()        – host starts game → "playing".
 *   5. removePlayer()     – player leaves / disconnects; host transfers if needed.
 *   6. deleteRoom()       – called when last player leaves.
 *
 * The manager does NOT own socket.io connections; all emit/join calls stay in
 * the handler layer.  The manager only mutates in-memory state and returns
 * the data needed for the handler to emit.
 */
export class GameRoomManager {
  private static _instance: GameRoomManager;

  private rooms = new Map<string, WaitingRoom>();
  /** Fast lookup: socket ID → room ID (for disconnect handling). */
  private socketToRoom = new Map<string, string>();

  static getInstance(): GameRoomManager {
    if (!GameRoomManager._instance) {
      GameRoomManager._instance = new GameRoomManager();
    }
    return GameRoomManager._instance;
  }

  // ── Room CRUD ──────────────────────────────────────────────────────────────

  createRoom(config: WaitingRoomConfig): WaitingRoom {
    const id = uuidv4();
    const room: WaitingRoom = {
      id,
      gameType: config.gameType,
      hostId: config.createdBy,
      maxPlayers: config.maxPlayers,
      startingBuyIn: config.startingBuyIn,
      minRebuy: config.minRebuy,
      maxRebuy: config.maxRebuy,
      stakes: { ante: 1, bringIn: 2 },
      allowRebuys: true,
      rebuyTimeoutSeconds: 120,
      players: [],
      status: "waiting",
      createdAt: new Date(),
    };
    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId: string): WaitingRoom | undefined {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      for (const p of room.players) {
        this.socketToRoom.delete(p.socketId);
      }
    }
    this.rooms.delete(roomId);
  }

  setStatus(roomId: string, status: WaitingRoom["status"]): void {
    const room = this.rooms.get(roomId);
    if (room) room.status = status;
  }

  // ── Player management ──────────────────────────────────────────────────────

  /**
   * Add a new player to the room.
   * Returns the seated `WaitingPlayer` or `null` if the room is full / not found.
   */
  addPlayer(roomId: string, args: AddPlayerArgs): WaitingPlayer | null {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length >= room.maxPlayers) return null;

    const seatIndex = this._nextFreeSeat(room);
    const player: WaitingPlayer = { ...args, seatIndex };

    room.players.push(player);
    this.socketToRoom.set(args.socketId, roomId);

    return player;
  }

  /**
   * Remove a player by userId.
   * Transfers host to the next player if needed.
   * Returns the removed player and the updated room, or nulls if not found.
   */
  removePlayer(
    roomId: string,
    userId: string,
  ): { removed: WaitingPlayer | null; room: WaitingRoom | null; hostChanged: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) return { removed: null, room: null, hostChanged: false };

    const idx = room.players.findIndex((p) => p.userId === userId);
    if (idx === -1) return { removed: null, room, hostChanged: false };

    const [removed] = room.players.splice(idx, 1) as [WaitingPlayer];
    this.socketToRoom.delete(removed.socketId);

    let hostChanged = false;
    if (removed.isHost && room.players.length > 0) {
      const newHost = room.players[0]!;
      newHost.isHost = true;
      room.hostId = newHost.userId;
      hostChanged = true;
    }

    return { removed, room, hostChanged };
  }

  /**
   * Update the socket ID for a player (handles reconnections).
   * Returns true when the player was found and updated.
   */
  updateSocketId(roomId: string, userId: string, newSocketId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find((p) => p.userId === userId);
    if (!player) return false;

    this.socketToRoom.delete(player.socketId);
    player.socketId = newSocketId;
    this.socketToRoom.set(newSocketId, roomId);

    return true;
  }

  setPlayerReady(roomId: string, userId: string, isReady: boolean): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find((p) => p.userId === userId);
    if (!player) return false;

    player.isReady = isReady;
    return true;
  }

  // ── Lookups ────────────────────────────────────────────────────────────────

  /** Find the room a socket currently belongs to (for disconnect handling). */
  getRoomBySocketId(socketId: string): WaitingRoom | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  isPlayerInRoom(roomId: string, userId: string): boolean {
    return (
      this.rooms.get(roomId)?.players.some((p) => p.userId === userId) ?? false
    );
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  /** Build the client-facing `WaitingRoomSnapshot` from a `WaitingRoom`. */
  snapshot(room: WaitingRoom): WaitingRoomSnapshot {
    return {
      roomId: room.id,
      gameType: room.gameType,
      stakes: "$1/$2",
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      players: room.players.map(({ userId, username, chips, isReady, seatIndex }) => ({
        userId,
        username,
        chips,
        isReady,
        seatIndex,
      })),
      startingBuyIn: room.startingBuyIn,
      minRebuy: room.minRebuy,
      maxRebuy: room.maxRebuy,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _nextFreeSeat(room: WaitingRoom): number {
    const occupied = new Set(room.players.map((p) => p.seatIndex));
    for (let i = 0; i < room.maxPlayers; i++) {
      if (!occupied.has(i)) return i;
    }
    return room.players.length;
  }
}
