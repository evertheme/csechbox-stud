export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type Rank =
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
  | "K"
  | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandRank =
  | "high-card"
  | "one-pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush"
  | "royal-flush";

export interface HandResult {
  rank: HandRank;
  cards: Card[];
  description: string;
  score: number;
}

export type BettingAction = "fold" | "check" | "call" | "raise" | "all-in";

export interface BettingActionPayload {
  action: BettingAction;
  amount?: number;
}

export type GamePhase =
  | "waiting"
  | "pre-flop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "ended";
