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

/** Payload emitted by the server on the "room-joined" event */
export interface RoomJoinedPayload {
  roomId: string;
}
