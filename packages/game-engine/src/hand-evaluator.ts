import { Card, Rank } from "./card.js";

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * All possible poker hand classifications, ordered from weakest (1) to
 * strongest (10). The numeric values are used as the most-significant
 * component of the comparison score, so `HandType.ROYAL_FLUSH > HandType.PAIR`
 * holds as a plain number comparison.
 */
export enum HandType {
  HIGH_CARD      = 1,
  PAIR           = 2,
  TWO_PAIR       = 3,
  THREE_OF_KIND  = 4,
  STRAIGHT       = 5,
  FLUSH          = 6,
  FULL_HOUSE     = 7,
  FOUR_OF_KIND   = 8,
  STRAIGHT_FLUSH = 9,
  ROYAL_FLUSH    = 10,
}

// ─── Result interface ─────────────────────────────────────────────────────────

/**
 * The result produced by evaluating a poker hand.
 *
 * @example
 * const result = HandEvaluator.best([...holeCards, ...communityCards]);
 * console.log(result.description); // "Full House, Kings over Tens"
 * console.log(result.value);       // composite number; higher = better
 */
export interface HandRank {
  /** Classification of the hand. */
  type: HandType;

  /**
   * Composite numeric score encoding hand type + tiebreakers in a single
   * number.  Two `HandRank` results can be compared with a simple subtraction:
   * `a.value - b.value` (positive → a wins, negative → b wins, 0 → chop).
   *
   * Encoding: `type * 15^5  +  c1 * 15^4  +  c2 * 15^3  +  c3 * 15^2
   *            +  c4 * 15  +  c5`
   * where c1–c5 are the hand-type-specific tiebreaker values (card ranks
   * in the order that matters for comparison, 0-padded on the right).
   */
  value: number;

  /**
   * The 5 cards that make up the hand, ordered for readability:
   * – matched cards come first (trips, then pair for a full house, etc.)
   * – kickers follow in descending rank order.
   */
  cards: Card[];

  /**
   * Human-readable description.
   * @example "Full House, Kings over Tens"
   * @example "Two Pair, Aces and Kings, Ten kicker"
   * @example "Straight Flush, Queen high"
   */
  description: string;

  /**
   * Cards that do not contribute to the primary hand pattern but are used
   * as tiebreakers when two hands share the same type and primary ranks.
   * Empty for hands where all 5 cards are part of the pattern (straights,
   * flushes, full houses, straight flushes, royal flushes).
   */
  kickers: Card[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** One group of same-rank cards, carrying pre-computed card value. */
interface RankGroup {
  value: number;
  cards: Card[];
}

/**
 * Build a human-readable rank label (singular or plural).
 * @example rankLabel(Rank.KING, true)  → "Kings"
 * @example rankLabel(Rank.ACE,  false) → "Ace"
 */
const RANK_LABELS: Record<Rank, string> = {
  [Rank.TWO]:   "Two",
  [Rank.THREE]: "Three",
  [Rank.FOUR]:  "Four",
  [Rank.FIVE]:  "Five",
  [Rank.SIX]:   "Six",
  [Rank.SEVEN]: "Seven",
  [Rank.EIGHT]: "Eight",
  [Rank.NINE]:  "Nine",
  [Rank.TEN]:   "Ten",
  [Rank.JACK]:  "Jack",
  [Rank.QUEEN]: "Queen",
  [Rank.KING]:  "King",
  [Rank.ACE]:   "Ace",
};

const RANK_PLURAL: Record<Rank, string> = {
  [Rank.TWO]:   "Twos",
  [Rank.THREE]: "Threes",
  [Rank.FOUR]:  "Fours",
  [Rank.FIVE]:  "Fives",
  [Rank.SIX]:   "Sixes",
  [Rank.SEVEN]: "Sevens",
  [Rank.EIGHT]: "Eights",
  [Rank.NINE]:  "Nines",
  [Rank.TEN]:   "Tens",
  [Rank.JACK]:  "Jacks",
  [Rank.QUEEN]: "Queens",
  [Rank.KING]:  "Kings",
  [Rank.ACE]:   "Aces",
};

function singular(rank: Rank): string { return RANK_LABELS[rank]; }
function plural(rank: Rank): string   { return RANK_PLURAL[rank]; }

/** Sort cards descending by numeric value. */
function sortDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.value - a.value);
}

/**
 * Encode a hand value as a single comparable integer.
 *
 * Uses base-15 positional encoding (max rank value is 14, so base 15 keeps
 * each slot unambiguous). Five tiebreaker slots are right-padded with 0.
 */
function encode(type: HandType, c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0): number {
  const B = 15;
  return (
    type * B ** 5 +
    c1   * B ** 4 +
    c2   * B ** 3 +
    c3   * B ** 2 +
    c4   * B      +
    c5
  );
}

/**
 * Generate all combinations of `size` elements drawn from `arr`.
 * C(7, 5) = 21 combinations for the standard 7-card case.
 */
function combinations<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];

  function pick(start: number, current: T[]): void {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    const remaining = size - current.length;
    for (let i = start; i <= arr.length - remaining; i++) {
      current.push(arr[i]!);
      pick(i + 1, current);
      current.pop();
    }
  }

  pick(0, []);
  return result;
}

// ─── HandEvaluator ────────────────────────────────────────────────────────────

/**
 * Stateless poker hand evaluator.
 *
 * Can be used as an instance or via static convenience methods.
 *
 * @example
 * const evaluator = new HandEvaluator();
 * const result = evaluator.evaluate([...holeCards, ...communityCards]);
 *
 * @example
 * // Static shorthand
 * const result = HandEvaluator.best([...holeCards, ...communityCards]);
 */
export class HandEvaluator {
  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Evaluate a hand of 5 or more cards, returning the best possible 5-card
   * `HandRank`.  When more than 5 cards are supplied all C(n, 5) combinations
   * are scored and the highest is returned.
   *
   * @param cards  5–7 (or more) `Card` instances.
   * @throws {RangeError} when fewer than 5 cards are provided.
   */
  evaluate(cards: Card[]): HandRank;

  /**
   * Evaluate hole cards combined with community cards, finding the best
   * 5-card hand from all 7 (or fewer) cards.
   *
   * @param holeCards      2 private cards belonging to the player.
   * @param communityCards 3–5 shared community cards.
   */
  evaluate(holeCards: Card[], communityCards: Card[]): HandRank;

  evaluate(first: Card[], second?: Card[]): HandRank {
    const all = second ? [...first, ...second] : first;

    if (all.length < 5) {
      throw new RangeError(`Need at least 5 cards to evaluate a hand (got ${all.length}).`);
    }

    if (all.length === 5) {
      return this.evaluateFive(all as [Card, Card, Card, Card, Card]);
    }

    // For 6+ cards find the best 5-card combination.
    let best: HandRank | null = null;
    for (const combo of combinations(all, 5)) {
      const result = this.evaluateFive(combo as [Card, Card, Card, Card, Card]);
      if (!best || result.value > best.value) best = result;
    }
    return best!;
  }

  /**
   * Evaluate exactly 5 cards and return the `HandRank`.
   *
   * @param cards Exactly 5 `Card` instances.
   */
  evaluateFive(cards: [Card, Card, Card, Card, Card]): HandRank {
    const sorted = sortDesc(cards);
    const groups = this.buildGroups(sorted);
    const flush  = this.detectFlush(sorted);
    const straight = this.detectStraight(sorted);

    return (
      this.tryRoyalFlush    (sorted, flush, straight) ??
      this.tryStraightFlush (sorted, flush, straight) ??
      this.tryFourOfKind    (groups)                  ??
      this.tryFullHouse     (groups)                  ??
      this.tryFlush         (sorted, flush)           ??
      this.tryStraight      (sorted, straight)        ??
      this.tryThreeOfKind   (groups)                  ??
      this.tryTwoPair       (groups)                  ??
      this.tryPair          (groups)                  ??
      this.buildHighCard    (sorted)
    );
  }

  // ── Static convenience ─────────────────────────────────────────────────────

  /**
   * Static shorthand for `new HandEvaluator().evaluate(cards)`.
   *
   * @example
   * const result = HandEvaluator.best([...hole, ...community]);
   */
  static best(cards: Card[]): HandRank;
  static best(holeCards: Card[], communityCards: Card[]): HandRank;
  static best(first: Card[], second?: Card[]): HandRank {
    const evaluator = new HandEvaluator();
    return second
      ? evaluator.evaluate(first, second)
      : evaluator.evaluate(first);
  }

  // ── Grouping ───────────────────────────────────────────────────────────────

  /**
   * Group `sorted` cards by rank, ordered by group size (desc) then card
   * value (desc).  This ordering lets callers pattern-match directly:
   * `groups[0].cards.length === 4` → four of a kind, etc.
   */
  private buildGroups(sorted: Card[]): RankGroup[] {
    const map = new Map<number, Card[]>();
    for (const card of sorted) {
      const existing = map.get(card.value);
      if (existing) existing.push(card);
      else map.set(card.value, [card]);
    }

    return [...map.values()]
      .map((cards) => ({ value: cards[0]!.value, cards }))
      .sort((a, b) => b.cards.length - a.cards.length || b.value - a.value);
  }

  // ── Flush / straight detection ─────────────────────────────────────────────

  /** Returns `true` when all 5 cards share the same suit. */
  private detectFlush(sorted: Card[]): boolean {
    return sorted.every((c) => c.suit === sorted[0]!.suit);
  }

  /**
   * Returns the value of the highest card in the straight, or `null` when
   * the 5 cards do not form a straight.
   *
   * Handles two edge cases:
   * - **Ace-high** (10-J-Q-K-A): returns `14`.
   * - **Ace-low / wheel** (A-2-3-4-5): returns `5` — the Ace acts as 1,
   *   so the highest card for comparison purposes is the 5.
   */
  private detectStraight(sorted: Card[]): number | null {
    const vals = sorted.map((c) => c.value);

    // Ace-low wheel: A-2-3-4-5 sorted as [14, 5, 4, 3, 2]
    if (
      vals[0] === 14 &&
      vals[1] === 5  &&
      vals[2] === 4  &&
      vals[3] === 3  &&
      vals[4] === 2
    ) {
      return 5; // highest card for comparison is the 5, not the ace
    }

    // Standard straight: each step is exactly 1 apart
    for (let i = 1; i < vals.length; i++) {
      if (vals[i - 1]! - vals[i]! !== 1) return null;
    }
    return vals[0]!;
  }

  // ── Individual hand builders ───────────────────────────────────────────────

  /** Royal Flush — A K Q J 10 all the same suit. */
  private tryRoyalFlush(
    sorted: Card[],
    flush: boolean,
    straightTop: number | null,
  ): HandRank | null {
    if (!flush || straightTop !== 14) return null;

    return {
      type: HandType.ROYAL_FLUSH,
      value: encode(HandType.ROYAL_FLUSH),
      cards: sorted,
      kickers: [],
      description: "Royal Flush",
    };
  }

  /**
   * Straight Flush — five consecutive ranks all the same suit.
   * Includes the wheel (A-2-3-4-5) where the high card is the 5.
   */
  private tryStraightFlush(
    sorted: Card[],
    flush: boolean,
    straightTop: number | null,
  ): HandRank | null {
    if (!flush || straightTop === null || straightTop === 14) return null;

    // For the wheel, display order is 5-4-3-2-A; ace moves to the end.
    const displayCards =
      straightTop === 5
        ? [...sorted.slice(1), sorted[0]!] // move ace to end
        : sorted;

    const highCard = displayCards[0]!;

    return {
      type: HandType.STRAIGHT_FLUSH,
      value: encode(HandType.STRAIGHT_FLUSH, straightTop),
      cards: displayCards,
      kickers: [],
      description: `Straight Flush, ${singular(highCard.rank)} high`,
    };
  }

  /** Four of a Kind — four cards of the same rank. */
  private tryFourOfKind(groups: RankGroup[]): HandRank | null {
    if (groups[0]!.cards.length !== 4) return null;

    const quad   = groups[0]!;
    const kicker = groups[1]!;

    return {
      type: HandType.FOUR_OF_KIND,
      value: encode(HandType.FOUR_OF_KIND, quad.value, kicker.value),
      cards: [...quad.cards, ...kicker.cards],
      kickers: kicker.cards,
      description: `Four of a Kind, ${plural(quad.cards[0]!.rank)}`,
    };
  }

  /** Full House — three of one rank plus two of another. */
  private tryFullHouse(groups: RankGroup[]): HandRank | null {
    if (groups[0]!.cards.length !== 3 || groups[1]?.cards.length !== 2) return null;

    const trips = groups[0]!;
    const pair  = groups[1]!;

    return {
      type: HandType.FULL_HOUSE,
      value: encode(HandType.FULL_HOUSE, trips.value, pair.value),
      cards: [...trips.cards, ...pair.cards],
      kickers: [],
      description:
        `Full House, ${plural(trips.cards[0]!.rank)} over ${plural(pair.cards[0]!.rank)}`,
    };
  }

  /** Flush — five cards of the same suit (not in sequence). */
  private tryFlush(sorted: Card[], flush: boolean): HandRank | null {
    if (!flush) return null;

    const [c1, c2, c3, c4, c5] = sorted;

    return {
      type: HandType.FLUSH,
      value: encode(HandType.FLUSH, c1!.value, c2!.value, c3!.value, c4!.value, c5!.value),
      cards: sorted,
      kickers: [],
      description: `Flush, ${singular(c1!.rank)} high`,
    };
  }

  /**
   * Straight — five consecutive ranks (not same suit).
   * The wheel (A-2-3-4-5) is the lowest straight; ace-high (10-J-Q-K-A) the
   * highest before a straight flush.
   */
  private tryStraight(sorted: Card[], straightTop: number | null): HandRank | null {
    if (straightTop === null) return null;

    const displayCards =
      straightTop === 5
        ? [...sorted.slice(1), sorted[0]!]
        : sorted;

    const highCard = displayCards[0]!;

    return {
      type: HandType.STRAIGHT,
      value: encode(HandType.STRAIGHT, straightTop),
      cards: displayCards,
      kickers: [],
      description: `Straight, ${singular(highCard.rank)} high`,
    };
  }

  /** Three of a Kind — three cards of the same rank plus two unrelated kickers. */
  private tryThreeOfKind(groups: RankGroup[]): HandRank | null {
    if (groups[0]!.cards.length !== 3 || (groups[1]?.cards.length ?? 0) > 1) return null;

    const trips   = groups[0]!;
    const kickers = sortDesc([...groups[1]?.cards ?? [], ...groups[2]?.cards ?? []]);

    return {
      type: HandType.THREE_OF_KIND,
      value: encode(HandType.THREE_OF_KIND, trips.value, kickers[0]!.value, kickers[1]!.value),
      cards: [...trips.cards, ...kickers],
      kickers,
      description: `Three of a Kind, ${plural(trips.cards[0]!.rank)}`,
    };
  }

  /** Two Pair — two different pairs plus one kicker. */
  private tryTwoPair(groups: RankGroup[]): HandRank | null {
    if (groups[0]!.cards.length !== 2 || groups[1]?.cards.length !== 2) return null;

    const hiPair = groups[0]!;
    const loPair = groups[1]!;
    const kicker = groups[2]!.cards;

    return {
      type: HandType.TWO_PAIR,
      value: encode(HandType.TWO_PAIR, hiPair.value, loPair.value, kicker[0]!.value),
      cards: [...hiPair.cards, ...loPair.cards, ...kicker],
      kickers: kicker,
      description:
        `Two Pair, ${plural(hiPair.cards[0]!.rank)} and ${plural(loPair.cards[0]!.rank)}, ` +
        `${singular(kicker[0]!.rank)} kicker`,
    };
  }

  /** One Pair — two cards of the same rank plus three kickers. */
  private tryPair(groups: RankGroup[]): HandRank | null {
    if (groups[0]!.cards.length !== 2 || (groups[1]?.cards.length ?? 0) > 1) return null;

    const pair    = groups[0]!;
    const kickers = sortDesc([
      ...groups[1]?.cards ?? [],
      ...groups[2]?.cards ?? [],
      ...groups[3]?.cards ?? [],
    ]);

    return {
      type: HandType.PAIR,
      value: encode(HandType.PAIR, pair.value, kickers[0]!.value, kickers[1]!.value, kickers[2]!.value),
      cards: [...pair.cards, ...kickers],
      kickers,
      description:
        `Pair of ${plural(pair.cards[0]!.rank)}, ` +
        `${kickers.map((k) => singular(k.rank)).join("-")} kicker${kickers.length > 1 ? "s" : ""}`,
    };
  }

  /** High Card — no pattern matches; five unrelated cards. */
  private buildHighCard(sorted: Card[]): HandRank {
    const [high, ...rest] = sorted;
    const kickers = rest as Card[];

    return {
      type: HandType.HIGH_CARD,
      value: encode(
        HandType.HIGH_CARD,
        high!.value,
        kickers[0]!.value,
        kickers[1]!.value,
        kickers[2]!.value,
        kickers[3]!.value,
      ),
      cards: sorted,
      kickers,
      description:
        `${singular(high!.rank)} high, ` +
        `${kickers.map((k) => singular(k.rank)).join("-")} kickers`,
    };
  }
}

// ─── Standalone utility ───────────────────────────────────────────────────────

/**
 * Compare two evaluated hands.
 *
 * @returns
 * - Positive number when `hand1` beats `hand2`.
 * - Negative number when `hand2` beats `hand1`.
 * - `0` when the hands are exactly equal in value (chop pot).
 *
 * @example
 * const hands = players.map(p => HandEvaluator.best(p.cards));
 * hands.sort((a, b) => compareHands(b, a)); // descending — winner first
 */
export function compareHands(hand1: HandRank, hand2: HandRank): number {
  return hand1.value - hand2.value;
}
