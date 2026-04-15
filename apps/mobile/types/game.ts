// ─── Game types shared across the mobile app ─────────────────────────────────

export type GameStatus = "waiting" | "playing" | "finished";

export interface GameRoom {
  id: string;
  /** Human-readable room name, e.g. "Friday Night Stud" */
  name: string;
  /** Variant label, e.g. "7 Card Stud" */
  gameType: string;
  /** Formatted stake string, e.g. "$1/$2" */
  stakes: string;
  /** Current number of seated players */
  players: number;
  /** Maximum seats at the table */
  maxPlayers: number;
  status: GameStatus;
}

// ─── Game variant registry ────────────────────────────────────────────────────

export interface GameVariant {
  id: string;
  /** Display name shown in the UI */
  name: string;
  /** Short rules description shown in the expandable info panel */
  description: string;
}

// ─── Stakes ───────────────────────────────────────────────────────────────────

export interface StakesPreset {
  /** Formatted label, e.g. "$1/$2" */
  label: string;
  /** Ante per hand */
  ante: number;
  /** Bring-in / big-bet size (used to calculate buy-in bounds) */
  bringIn: number;
}

export interface Stakes {
  ante: number;
  bringIn: number;
}

// ─── Socket payloads ──────────────────────────────────────────────────────────

/** Payload emitted by the server on the "room-joined" event */
export interface RoomJoinedPayload {
  roomId: string;
}

/** Payload emitted by the server on the "room-created" event */
export interface RoomCreatedPayload {
  roomId: string;
}

/** Payload the client emits on the "create-room" event */
export interface CreateRoomPayload {
  gameType: string;
  maxPlayers: number;
  startingBuyIn: number;
  minRebuy: number;
  maxRebuy: number;
  /** Fixed at $1/$2 for all games. */
  stakes: { ante: 1; bringIn: 2 };
  allowRebuys: true;
  /** 2 minutes — fixed. */
  rebuyTimeoutSeconds: 120;
  endConditions: { manualEnd: true; onePlayerRemains: true };
}

// ─── Game room (waiting room) ─────────────────────────────────────────────────

/** A single player occupying a seat in the waiting room */
export interface RoomPlayer {
  userId: string;
  username: string;
  chips: number;
  isReady: boolean;
  /** 0-based seat index */
  seatIndex: number;
}

/** Full snapshot of a game room's state, delivered by the "room-state" event */
export interface RoomState {
  roomId: string;
  /** Game-type identifier (matches GameVariant.id) or a display label from the server */
  gameType: string;
  /** Formatted stake string, e.g. "$1/$2" */
  stakes: string;
  maxPlayers: number;
  /** userId of the room creator / current host */
  hostId: string;
  players: RoomPlayer[];
}

// ─── Game room socket event payloads ─────────────────────────────────────────

/** Server → client: a player joined a seat */
export interface PlayerJoinedPayload {
  player: RoomPlayer;
}

/** Server → client: a player left */
export interface PlayerLeftPayload {
  userId: string;
}

/** Server → client: a player's ready status changed */
export interface PlayerReadyPayload {
  userId: string;
  isReady: boolean;
}

/** Server → client: host ownership was transferred */
export interface HostChangedPayload {
  hostId: string;
}

/** Server → client: the game has started; navigate to the gameplay screen */
export interface GameStartedPayload {
  roomId: string;
}
