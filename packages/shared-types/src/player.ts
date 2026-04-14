import type { Card } from "./poker.js";

export type PlayerStatus = "active" | "folded" | "all-in" | "sitting-out" | "disconnected";

export interface Player {
  id: string;
  username: string;
  avatarUrl?: string;
  chipCount: number;
  status: PlayerStatus;
  seatIndex: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  currentBet: number;
  totalBetInRound: number;
  holeCards?: Card[];
}

export interface PlayerPublic extends Omit<Player, "holeCards"> {
  hasHoleCards: boolean;
}

export interface PlayerAction {
  playerId: string;
  timestamp: number;
}
