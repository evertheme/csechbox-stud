import type { BettingActionPayload, GamePhase } from "./poker.js";
import type { GameState, GameRoom } from "./game.js";
import type { Player, PlayerPublic } from "./player.js";

// Events emitted from client → server
export interface ClientToServerEvents {
  "room:join": (roomId: string, callback: (state: GameState | null) => void) => void;
  "room:leave": (roomId: string) => void;
  "room:create": (name: string, callback: (room: GameRoom) => void) => void;
  "game:action": (payload: BettingActionPayload) => void;
  "game:start": () => void;
  "player:ready": () => void;
}

// Events emitted from server → client
export interface ServerToClientEvents {
  "game:state": (state: GameState) => void;
  "game:phase-change": (phase: GamePhase) => void;
  "game:player-joined": (player: PlayerPublic) => void;
  "game:player-left": (playerId: string) => void;
  "game:action": (playerId: string, payload: BettingActionPayload) => void;
  "game:deal-hole-cards": (cards: import("./poker.js").Card[]) => void;
  "game:showdown": (results: ShowdownResult[]) => void;
  "room:list": (rooms: GameRoom[]) => void;
  "error": (message: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  playerId: string;
  username: string;
  roomId?: string;
}

export interface ShowdownResult {
  playerId: string;
  player: Player;
  handDescription: string;
  handScore: number;
  winAmount: number;
  isWinner: boolean;
}
