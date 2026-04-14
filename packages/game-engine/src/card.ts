import type { Card as PlainCard } from "@poker/shared-types";

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Suit {
  SPADES   = "spades",
  HEARTS   = "hearts",
  DIAMONDS = "diamonds",
  CLUBS    = "clubs",
}

export enum Rank {
  TWO   = "2",
  THREE = "3",
  FOUR  = "4",
  FIVE  = "5",
  SIX   = "6",
  SEVEN = "7",
  EIGHT = "8",
  NINE  = "9",
  TEN   = "10",
  JACK  = "J",
  QUEEN = "Q",
  KING  = "K",
  ACE   = "A",
}

// ─── Lookup tables ────────────────────────────────────────────────────────────

const RANK_VALUES: Record<Rank, number> = {
  [Rank.TWO]:   2,
  [Rank.THREE]: 3,
  [Rank.FOUR]:  4,
  [Rank.FIVE]:  5,
  [Rank.SIX]:   6,
  [Rank.SEVEN]: 7,
  [Rank.EIGHT]: 8,
  [Rank.NINE]:  9,
  [Rank.TEN]:   10,
  [Rank.JACK]:  11,
  [Rank.QUEEN]: 12,
  [Rank.KING]:  13,
  [Rank.ACE]:   14,
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.SPADES]:   "♠",
  [Suit.HEARTS]:   "♥",
  [Suit.DIAMONDS]: "♦",
  [Suit.CLUBS]:    "♣",
};

// ─── Ordered arrays (useful for deck construction) ────────────────────────────

export const ALL_SUITS: readonly Suit[] = [
  Suit.SPADES,
  Suit.HEARTS,
  Suit.DIAMONDS,
  Suit.CLUBS,
];

export const ALL_RANKS: readonly Rank[] = [
  Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE,
  Rank.SIX, Rank.SEVEN, Rank.EIGHT, Rank.NINE,
  Rank.TEN, Rank.JACK,  Rank.QUEEN, Rank.KING, Rank.ACE,
];

// ─── Card class ───────────────────────────────────────────────────────────────

export class Card implements PlainCard {
  readonly rank: Rank;
  readonly suit: Suit;

  constructor(rank: Rank, suit: Suit) {
    this.rank = rank;
    this.suit = suit;
  }

  // ── Computed properties ──────────────────────────────────────────────────

  /** Numeric value: 2–9 face value, J=11, Q=12, K=13, A=14 */
  get value(): number {
    return RANK_VALUES[this.rank];
  }

  /** Unicode suit symbol: ♠ ♥ ♦ ♣ */
  get symbol(): string {
    return SUIT_SYMBOLS[this.suit];
  }

  // ── Methods ──────────────────────────────────────────────────────────────

  /** Returns the card in short notation, e.g. "A♠" or "10♥" */
  toString(): string {
    return `${this.rank}${this.symbol}`;
  }

  /** Structural equality — two cards are equal if rank and suit match */
  equals(other: Card): boolean {
    return this.rank === other.rank && this.suit === other.suit;
  }

  /** Compare by numeric value only (ignores suit). Positive = this > other */
  compareValue(other: Card): number {
    return this.value - other.value;
  }

  // ── Serialisation ────────────────────────────────────────────────────────

  /** Plain object suitable for JSON transport / shared-types consumers */
  toPlain(): PlainCard {
    return { rank: this.rank, suit: this.suit };
  }

  /** Reconstruct a Card from a plain shared-types Card object */
  static fromPlain(plain: PlainCard): Card {
    return new Card(plain.rank as Rank, plain.suit as Suit);
  }

  /** Create every possible card (52 total), ordered by suit then rank */
  static fullDeck(): Card[] {
    return ALL_SUITS.flatMap((suit) =>
      ALL_RANKS.map((rank) => new Card(rank, suit)),
    );
  }
}
