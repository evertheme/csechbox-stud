import type { BettingActionPayload, GamePhase } from "./poker.js";
import type { GameState, GameRoom } from "./game.js";
import type { Player, PlayerPublic } from "./player.js";

export interface CreateRoomOptions {
  /** Human-readable room name shown in the lobby. */
  name: string;
  /** Maximum number of seats at the table (2–8). */
  maxPlayers?: number;
  /** Small blind / ante amount. */
  smallBlind?: number;
  /** Big blind / bring-in amount. */
  bigBlind?: number;
  /** Minimum buy-in chips required to join. */
  minBuyIn?: number;
}

// ─── Waiting-room types (friendly game flow) ──────────────────────────────────

/** Config the client sends with the "create-room" event. */
export interface WaitingRoomCreateConfig {
  gameType: string;
  maxPlayers: number;
  startingBuyIn: number;
  minRebuy: number;
  maxRebuy: number;
  stakes: { ante: 1; bringIn: 2 };
  allowRebuys: true;
  rebuyTimeoutSeconds: 120;
  endConditions: { manualEnd: true; onePlayerRemains: true };
}

/** Player seat snapshot sent to clients inside room-state / player-joined. */
export interface WaitingPlayerSnapshot {
  userId: string;
  username: string;
  chips: number;
  isReady: boolean;
  seatIndex: number;
}

/** Full room snapshot delivered via the "room-state" event. */
export interface WaitingRoomSnapshot {
  roomId: string;
  gameType: string;
  /** Formatted stake string, always "$1/$2". */
  stakes: string;
  maxPlayers: number;
  hostId: string;
  players: WaitingPlayerSnapshot[];
  startingBuyIn: number;
  minRebuy: number;
  maxRebuy: number;
}

// ─── Events emitted from client → server ─────────────────────────────────────

export interface ClientToServerEvents {
  // ── Legacy lobby flow ──────────────────────────────────────────────────────
  "room:join": (roomId: string, callback: (state: GameState | null) => void) => void;
  "room:leave": (roomId: string) => void;
  "room:create": (options: CreateRoomOptions, callback: (room: GameRoom) => void) => void;
  "game:action": (payload: BettingActionPayload) => void;
  "game:start": () => void;
  "player:ready": () => void;

  // ── Waiting-room flow (friendly game) ─────────────────────────────────────
  /** Create a new game room with fixed $1/$2 stakes. */
  "create-room": (config: WaitingRoomCreateConfig) => void;
  /** Request a full room-state snapshot (also joins the room if not a member). */
  "get-room": (payload: { roomId: string }) => void;
  /** Toggle the caller's ready status inside a waiting room. */
  "player-ready": (payload: { roomId: string; isReady: boolean }) => void;
  /** Leave a waiting room gracefully. */
  "leave-room": (payload: { roomId: string }) => void;
  /** Host-only: start the game once all players are ready. */
  "start-game": (payload: { roomId: string }) => void;
}

// ─── Events emitted from server → client ─────────────────────────────────────

export interface ServerToClientEvents {
  // ── Legacy lobby flow ──────────────────────────────────────────────────────
  "game:state": (state: GameState) => void;
  "game:phase-change": (phase: GamePhase) => void;
  "game:player-joined": (player: PlayerPublic) => void;
  "game:player-left": (playerId: string) => void;
  "game:action": (playerId: string, payload: BettingActionPayload) => void;
  "game:deal-hole-cards": (cards: import("./poker.js").Card[]) => void;
  "game:showdown": (results: ShowdownResult[]) => void;
  "room:list": (rooms: GameRoom[]) => void;
  "error": (message: string) => void;

  // ── Waiting-room flow (friendly game) ─────────────────────────────────────
  /** Sent to the creator only after their room is successfully created. */
  "room-created": (payload: { roomId: string }) => void;
  /** Sent to the creator if room creation fails. */
  "create-room-error": (payload: { message: string }) => void;
  /** Full room snapshot — sent in response to "get-room". */
  "room-state": (state: WaitingRoomSnapshot) => void;
  /** Broadcast to room when a new player takes a seat. */
  "player-joined": (payload: { player: WaitingPlayerSnapshot }) => void;
  /** Broadcast to room when a player leaves. */
  "player-left": (payload: { userId: string }) => void;
  /** Broadcast to room when a player toggles their ready status. */
  "player-ready": (payload: { userId: string; isReady: boolean }) => void;
  /** Broadcast to room when the host starts the game. */
  "game-started": (payload: { roomId: string }) => void;
  /** Broadcast to room when host ownership transfers. */
  "host-changed": (payload: { hostId: string }) => void;
  /** Broadcast to room when the host closes it mid-wait. */
  "room-closed": (payload: Record<string, never>) => void;

  // ── In-game events (active hand) ───────────────────────────────────────────
  /** Broadcast when any player's 40-second turn timer begins. */
  "turn-timer-started": (payload: {
    playerId: string;
    timeoutSeconds: number;
    startTime: number;
  }) => void;
  /** Broadcast at the 10-second warning mark. */
  "turn-timer-warning": (payload: {
    playerId: string;
    secondsRemaining: number;
  }) => void;
  /** Sent only to the player whose turn is about to expire. */
  "your-turn-warning": (payload: { secondsRemaining: number }) => void;
  /** Broadcast when a player is auto-folded after the timer expires. */
  "player-timed-out": (payload: {
    playerId: string;
    username: string;
    chipsForfeited: number;
    action: "fold";
  }) => void;
  /** Broadcast when a player is sat out (auto or manual) between hands. */
  "player-sat-out": (payload: {
    playerId: string;
    username: string;
    chips: number;
    reason: string;
    automatic: boolean;
  }) => void;
  /** Broadcast when the game session ends (all hands complete or auto-ended). */
  "game-ended": (payload: { reason: string; autoEnded?: boolean }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  playerId: string;
  username: string;
  roomId?: string;
  /** Authenticated Supabase user — populated by the JWT middleware. */
  user?: { id: string; username: string } | null;
}

export interface ShowdownResult {
  playerId: string;
  player: Player;
  handDescription: string;
  handScore: number;
  winAmount: number;
  isWinner: boolean;
}
