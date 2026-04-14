import type { Card, GamePhase } from "./poker.js";
import type { PlayerPublic } from "./player.js";

export interface GameSettings {
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers: number;
  turnTimeoutSeconds: number;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: PlayerPublic[];
  communityCards: Card[];
  pots: Pot[];
  currentPlayerIndex: number;
  dealerIndex: number;
  settings: GameSettings;
  lastAction?: string;
  roundNumber: number;
  createdAt: number;
  updatedAt: number;
}

export interface GameRoom {
  id: string;
  name: string;
  settings: GameSettings;
  playerCount: number;
  maxPlayers: number;
  isStarted: boolean;
  createdAt: number;
}
