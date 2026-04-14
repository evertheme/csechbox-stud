import { randomBytes } from "crypto";
import { Card } from "./card.js";

// ─── Secure random helper ─────────────────────────────────────────────────────

/**
 * Returns an unbiased cryptographically secure random integer in [0, max).
 *
 * Plain `value % max` over a uint32 introduces modulo bias when 2^32 is not
 * evenly divisible by `max`. We discard values in the "biased tail" and draw
 * again — rejection sampling. Each draw has at most a 50 % rejection rate so
 * the expected number of iterations is < 2.
 */
function secureRandomInt(max: number): number {
  if (max <= 1) return 0;

  const UINT32_MAX = 0xffff_ffff;
  // Largest multiple of `max` that fits in a uint32
  const limit = UINT32_MAX - (UINT32_MAX % max);

  let value: number;
  do {
    value = randomBytes(4).readUInt32BE(0);
  } while (value > limit);

  return value % max;
}

// ─── Deck ─────────────────────────────────────────────────────────────────────

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = Card.fullDeck();
  }

  // ── Shuffle ──────────────────────────────────────────────────────────────

  /**
   * In-place Fisher-Yates shuffle using `crypto.randomBytes` so the order is
   * not predictable from knowledge of the PRNG state.
   * Returns `this` for chaining: `new Deck().shuffle().deal(5)`.
   */
  shuffle(): this {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = secureRandomInt(i + 1);
      // Swap
      [this.cards[i], this.cards[j]] = [this.cards[j]!, this.cards[i]!];
    }
    return this;
  }

  // ── Deal (overloaded) ────────────────────────────────────────────────────

  /** Remove and return the top card. Throws if the deck is empty. */
  deal(): Card;
  /** Remove and return the top `n` cards as an array. Throws if not enough cards remain. */
  deal(n: number): Card[];
  deal(n?: number): Card | Card[] {
    if (n === undefined) {
      // Single-card overload
      if (this.cards.length === 0) {
        throw new Error("Cannot deal from an empty deck.");
      }
      return this.cards.shift()!;
    }

    // Multi-card overload
    if (n < 0 || !Number.isInteger(n)) {
      throw new RangeError(`deal() count must be a non-negative integer (got ${n}).`);
    }
    if (n > this.cards.length) {
      throw new Error(
        `Cannot deal ${n} card${n === 1 ? "" : "s"} — only ${this.cards.length} remain.`,
      );
    }
    return this.cards.splice(0, n);
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  /**
   * Restore all 52 cards in their original unshuffled order.
   * Returns `this` for chaining: `deck.reset().shuffle()`.
   */
  reset(): this {
    this.cards = Card.fullDeck();
    return this;
  }

  // ── Inspection ───────────────────────────────────────────────────────────

  /** Number of cards currently in the deck. */
  get cardsRemaining(): number {
    return this.cards.length;
  }

  /** @deprecated Use `cardsRemaining` instead. */
  get remaining(): number {
    return this.cardsRemaining;
  }

  /** Peek at the top card without removing it. Returns `undefined` if empty. */
  peek(): Card | undefined {
    return this.cards[0];
  }

  /** `true` when no cards are left. */
  get isEmpty(): boolean {
    return this.cards.length === 0;
  }
}
