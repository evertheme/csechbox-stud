// ─── Core card types ─────────────────────────────────────────────────────────

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Whether the card is visible to all players */
  faceUp: boolean;
}

// ─── Player action ───────────────────────────────────────────────────────────

export type PlayerAction =
  | "fold"
  | "check"
  | "call"
  | "raise"
  | "bet"
  | "all-in";

// ─── Street (betting round) ───────────────────────────────────────────────────

export type Street =
  | "3rd"
  | "4th"
  | "5th"
  | "6th"
  | "7th"
  | "river";

// ─── Player state during a hand ───────────────────────────────────────────────

export interface GamePlayer {
  userId: string;
  username: string;
  /** Current chip stack (excluding current bet) */
  chips: number;
  cards: Card[];
  /** Amount bet this street by this player */
  currentBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  seatIndex: number;
  /** Most recent action for UI annotation */
  lastAction?: PlayerAction;
  lastActionAmount?: number;
}

// ─── Full game state ──────────────────────────────────────────────────────────

export interface GameState {
  roomId: string;
  /** Game variant id, e.g. "7-card-stud" */
  gameType: string;
  street: Street;
  /** Total chips in the pot */
  pot: number;
  /** Highest bet placed this street (players must at least call this) */
  currentBet: number;
  /** Minimum additional raise over the current bet */
  minRaise: number;
  /** userId of the player whose turn it is, or null between streets */
  activePlayerId: string | null;
  /** userId of the dealer / bring-in player */
  dealerPlayerId: string | null;
  players: GamePlayer[];
  status: "playing" | "showdown" | "finished";
}

// ─── Winner info (set on winner-declared) ────────────────────────────────────

export interface WinnerInfo {
  playerId: string;
  username: string;
  amount: number;
  /** Optional hand description, e.g. "Full House, Kings over Tens" */
  handDescription?: string;
}

// ─── Socket event payloads ────────────────────────────────────────────────────

/** Client → server: perform an action */
export interface PlayerActionPayload {
  roomId: string;
  action: PlayerAction;
  amount?: number;
}

/** Server → client: a player acted; includes updated game state */
export interface PlayerActedPayload {
  playerId: string;
  action: PlayerAction;
  amount?: number;
  gameState: GameState;
}

/** Server → client: pot total changed (e.g. chips moved to pot) */
export interface PotUpdatedPayload {
  pot: number;
}

/** Server → client: betting round ended, new street starts */
export interface StreetCompletePayload {
  street: Street;
  gameState: GameState;
}

/** Server → client: all active players reveal cards */
export interface ShowdownPayload {
  gameState: GameState;
}

/** Server → client: hand is over, winner declared */
export interface WinnerDeclaredPayload {
  winner: WinnerInfo;
  gameState: GameState;
}
