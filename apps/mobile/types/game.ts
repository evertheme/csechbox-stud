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
  stakes: Stakes;
  maxPlayers: number;
  buyIn: number;
}
