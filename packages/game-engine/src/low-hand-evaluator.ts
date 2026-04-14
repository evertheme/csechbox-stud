import { Card, Rank } from "./card.js";
import type { HandRank } from "./hand-evaluator.js";

// ─── Low hand type enum ───────────────────────────────────────────────────────

/**
 * Hand classifications for Razz / Ace-to-Five lowball poker, ordered from
 * worst (1) to best (6).
 *
 * The numeric values are used as the most-significant component of the
 * comparison score, so `LowHandType.NO_PAIR > LowHandType.PAIR` holds as a
 * plain numeric comparison — the same "higher value = better hand" convention
 * used by the standard {@link HandRank}.
 *
 * Straights and flushes **do not exist** in Razz; those 5 cards are scored
 * as `NO_PAIR` (if unpaired) just like any other collection of distinct ranks.
 */
export enum LowHandType {
  /** Four cards of the same rank — worst possible Razz hand. */
  FOUR_OF_KIND  = 1,
  /** Three of one rank plus two of another. */
  FULL_HOUSE    = 2,
  /** Three cards of the same rank. */
  THREE_OF_KIND = 3,
  /** Two separate pairs. */
  TWO_PAIR      = 4,
  /** One pair — any unpaired hand beats this. */
  PAIR          = 5,
  /**
   * Five cards with no repeated rank.
   * Straights and flushes are **ignored** in Razz, so A♠2♠3♠4♠5♠ is still
   * just "the wheel" — the best possible hand.
   */
  NO_PAIR       = 6,
}

// ─── Result interface ─────────────────────────────────────────────────────────

/**
 * The result produced by evaluating a Razz / lowball hand.
 *
 * Structurally identical to {@link HandRank} but uses {@link LowHandType}
 * instead of `HandType`. The `value` field follows the same convention:
 * **higher value wins**.  Use `compareLowHands(a, b)` or a plain
 * `a.value - b.value` subtraction to determine the winner.
 *
 * @example
 * const result = LowHandEvaluator.best([...sevenCards]);
 * console.log(result.description); // "Wheel (A-2-3-4-5)"
 * console.log(result.value);       // highest possible no-pair value
 */
export interface LowHandRank {
  /** Razz hand category. `NO_PAIR` is the best (highest numeric) category. */
  type: LowHandType;

  /**
   * Composite score encoding hand type + tiebreakers as a single integer.
   *
   * **Higher value = better Razz hand.**
   *
   * Encoding: `type × 14^5 + iv1 × 14^4 + iv2 × 14^3 + iv3 × 14^2 + iv4 × 14 + iv5`
   *
   * `iv` slots hold **inverted low values** (`14 − lowValue`) for each
   * relevant card, filled in the order that matters for comparison (worst /
   * highest-ranked card first for no-pair; paired ranks before kickers for
   * paired hands). Slots not needed for a hand type are zero-padded.
   *
   * Inversion maps: A→13, 2→12, 3→11 … K→1, so lower cards produce
   * larger contributions and therefore higher scores.
   */
  value: number;

  /**
   * All 5 cards that make up this hand, presented **lowest to highest** in
   * Razz terms (Ace first when present, King last):
   * - No pair: e.g. [A, 2, 3, 4, 5] for the wheel.
   * - Paired hands: paired cards first (lower pair rank first), then kickers
   *   in ascending order.
   */
  cards: Card[];

  /**
   * Human-readable description using Razz conventions.
   * @example "Wheel (A-2-3-4-5)"
   * @example "Eight low (A-3-5-6-8)"
   * @example "Pair of Twos, A-3-5 kickers"
   * @example "Two Pair, Twos and Threes, Ace kicker"
   */
  description: string;

  /**
   * For **no-pair** hands: empty — all 5 cards equally define the hand.
   * For **paired** hands: the unpaired cards sorted ascending by Razz value,
   * used as tiebreakers after the paired ranks are resolved.
   */
  kickers: Card[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** One group of same-rank cards with their Razz low value cached. */
interface LowGroup {
  /** Ace-to-Five low value: A=1, 2=2 … K=13. */
  lowVal: number;
  cards: Card[];
}

/**
 * Razz (Ace-to-Five) value of a card.
 * Ace is always 1; all other ranks keep their pip value.
 */
function lowValue(card: Card): number {
  return card.rank === Rank.ACE ? 1 : card.value;
}

/**
 * Inverted low value for use in the composite score.
 * Lower cards (better in Razz) produce **higher** inverted values.
 *
 * A→13, 2→12, 3→11 … K→1
 */
function invertedLow(card: Card): number {
  return 14 - lowValue(card);
}

/** Sort cards ascending by Razz low value (Ace first, King last). */
function sortAsc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => lowValue(a) - lowValue(b));
}

/** Sort cards descending by Razz low value (King first, Ace last). */
function sortDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => lowValue(b) - lowValue(a));
}

/**
 * Encode a Razz hand value as a single comparable integer.
 *
 * Uses base-14 positional encoding. Each slot holds an inverted low value
 * in `[0, 13]`, so base 14 is sufficient.  Five tiebreaker slots are
 * zero-padded on the right.
 */
function encode(
  type: LowHandType,
  iv1 = 0, iv2 = 0, iv3 = 0, iv4 = 0, iv5 = 0,
): number {
  const B = 14;
  return (
    type * B ** 5 +
    iv1  * B ** 4 +
    iv2  * B ** 3 +
    iv3  * B ** 2 +
    iv4  * B      +
    iv5
  );
}

/**
 * Generate all combinations of `size` elements from `arr`.
 * C(7, 5) = 21 for the standard 7-card case.
 */
function combinations<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];

  function pick(start: number, current: T[]): void {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    const need = size - current.length;
    for (let i = start; i <= arr.length - need; i++) {
      current.push(arr[i]!);
      pick(i + 1, current);
      current.pop();
    }
  }

  pick(0, []);
  return result;
}

// ── Label helpers ─────────────────────────────────────────────────────────────

const LOW_LABELS: Record<Rank, string> = {
  [Rank.ACE]:   "A",
  [Rank.TWO]:   "2",
  [Rank.THREE]: "3",
  [Rank.FOUR]:  "4",
  [Rank.FIVE]:  "5",
  [Rank.SIX]:   "6",
  [Rank.SEVEN]: "7",
  [Rank.EIGHT]: "8",
  [Rank.NINE]:  "9",
  [Rank.TEN]:   "10",
  [Rank.JACK]:  "J",
  [Rank.QUEEN]: "Q",
  [Rank.KING]:  "K",
};

const LOW_NAMES: Record<Rank, string> = {
  [Rank.ACE]:   "Ace",
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
};

const LOW_PLURAL: Record<Rank, string> = {
  [Rank.ACE]:   "Aces",
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
};

function label(card: Card): string        { return LOW_LABELS[card.rank]; }
function singular(rank: Rank): string     { return LOW_NAMES[rank]; }
function plural(rank: Rank): string       { return LOW_PLURAL[rank]; }

// ─── LowHandEvaluator ─────────────────────────────────────────────────────────

/**
 * Stateless Razz / Ace-to-Five lowball hand evaluator.
 *
 * **Rules:**
 * - Ace is **always** low (value 1).
 * - Straights and flushes are **ignored** — they do not form special hands.
 * - The best possible hand is A-2-3-4-5 (the "wheel" or "bicycle").
 * - Unpaired hands beat all paired hands.
 * - Among unpaired hands, the one with the **lowest highest card** wins;
 *   ties resolved by comparing the next highest card, and so on.
 * - Among paired hands, fewer pairs is better; for equal pairing count,
 *   lower paired rank is better, then lower kickers.
 *
 * The `value` field on every returned {@link LowHandRank} follows the same
 * convention as {@link HandRank}: **higher value wins**.  This means you can
 * call `compareLowHands(a, b)` or sort with `(a, b) => b.value - a.value` to
 * find the winner.
 *
 * @example
 * const evaluator = new LowHandEvaluator();
 * const result = evaluator.evaluate(sevenCards);
 * console.log(result.description); // "Wheel (A-2-3-4-5)"
 *
 * @example
 * // Static shorthand
 * const result = LowHandEvaluator.best(holeCards, communityCards);
 */
export class LowHandEvaluator {
  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Evaluate a hand of 5 or more cards and return the **best** (lowest)
   * possible 5-card {@link LowHandRank}.
   *
   * When more than 5 cards are supplied, all C(n, 5) combinations are scored
   * and the highest-value result (= the best Razz hand) is returned.
   *
   * @param cards  At least 5 `Card` instances.
   * @throws {RangeError} when fewer than 5 cards are provided.
   */
  evaluate(cards: Card[]): LowHandRank;

  /**
   * Evaluate hole cards combined with community cards, finding the best
   * (lowest) 5-card hand from all available cards.
   *
   * @param holeCards       The player's private cards.
   * @param communityCards  Shared community cards.
   */
  evaluate(holeCards: Card[], communityCards: Card[]): LowHandRank;

  evaluate(first: Card[], second?: Card[]): LowHandRank {
    const all = second ? [...first, ...second] : first;

    if (all.length < 5) {
      throw new RangeError(
        `Need at least 5 cards to evaluate a Razz hand (got ${all.length}).`,
      );
    }

    if (all.length === 5) {
      return this.evaluateFive(all as [Card, Card, Card, Card, Card]);
    }

    // Find the best (highest value = lowest Razz hand) from all combinations.
    let best: LowHandRank | null = null;
    for (const combo of combinations(all, 5)) {
      const result = this.evaluateFive(combo as [Card, Card, Card, Card, Card]);
      if (!best || result.value > best.value) best = result;
    }
    return best!;
  }

  /**
   * Evaluate exactly 5 cards under Razz / Ace-to-Five lowball rules.
   *
   * @param cards Exactly 5 `Card` instances.
   */
  evaluateFive(cards: [Card, Card, Card, Card, Card]): LowHandRank {
    const groups = this.buildGroups(cards);

    return (
      this.tryFourOfKind  (groups) ??
      this.tryFullHouse   (groups) ??
      this.tryThreeOfKind (groups) ??
      this.tryTwoPair     (groups) ??
      this.tryPair        (groups) ??
      this.buildNoPair    ([...cards])
    );
  }

  // ── Static convenience ─────────────────────────────────────────────────────

  /**
   * Static shorthand for `new LowHandEvaluator().evaluate(...)`.
   *
   * @example
   * const result = LowHandEvaluator.best([...hole, ...community]);
   */
  static best(cards: Card[]): LowHandRank;
  static best(holeCards: Card[], communityCards: Card[]): LowHandRank;
  static best(first: Card[], second?: Card[]): LowHandRank {
    const ev = new LowHandEvaluator();
    return second ? ev.evaluate(first, second) : ev.evaluate(first);
  }

  // ── Grouping ───────────────────────────────────────────────────────────────

  /**
   * Group cards by rank, sorted by:
   * 1. Group size **descending** — quads before trips before pairs before singles.
   * 2. Razz low value **descending** within same size — the "worst" (highest
   *    low value) group appears first so it becomes the most-significant
   *    encoded slot.  Aces (low value 1) sort last → they are the best pair.
   */
  private buildGroups(cards: readonly Card[]): LowGroup[] {
    const map = new Map<number, Card[]>();
    for (const card of cards) {
      const lv = lowValue(card);
      const existing = map.get(lv);
      if (existing) existing.push(card);
      else map.set(lv, [card]);
    }

    return [...map.values()]
      .map((cs) => ({ lowVal: lowValue(cs[0]!), cards: cs }))
      .sort((a, b) => b.cards.length - a.cards.length || b.lowVal - a.lowVal);
  }

  // ── Hand builders ──────────────────────────────────────────────────────────

  /** Four of a Kind — the worst Razz hand. */
  private tryFourOfKind(groups: LowGroup[]): LowHandRank | null {
    if (groups[0]!.cards.length !== 4) return null;

    const quad   = groups[0]!;
    const kicker = groups[1]!;
    const displayCards = [...sortAsc(quad.cards), ...kicker.cards];

    return {
      type: LowHandType.FOUR_OF_KIND,
      value: encode(LowHandType.FOUR_OF_KIND, invertedLow(quad.cards[0]!), invertedLow(kicker.cards[0]!)),
      cards: displayCards,
      kickers: kicker.cards,
      description: `Four of a Kind, ${plural(quad.cards[0]!.rank)}, ${label(kicker.cards[0]!)} kicker`,
    };
  }

  /** Full House — three of one rank + two of another. */
  private tryFullHouse(groups: LowGroup[]): LowHandRank | null {
    if (groups[0]!.cards.length !== 3 || groups[1]?.cards.length !== 2) return null;

    const trips = groups[0]!;
    const pair  = groups[1]!;
    const displayCards = [...sortAsc(trips.cards), ...sortAsc(pair.cards)];

    return {
      type: LowHandType.FULL_HOUSE,
      value: encode(LowHandType.FULL_HOUSE, invertedLow(trips.cards[0]!), invertedLow(pair.cards[0]!)),
      cards: displayCards,
      kickers: [],
      description: `Full House, ${plural(trips.cards[0]!.rank)} over ${plural(pair.cards[0]!.rank)}`,
    };
  }

  /** Three of a Kind. */
  private tryThreeOfKind(groups: LowGroup[]): LowHandRank | null {
    if (groups[0]!.cards.length !== 3 || (groups[1]?.cards.length ?? 0) > 1) return null;

    const trips   = groups[0]!;
    const kickers = sortAsc([...groups[1]?.cards ?? [], ...groups[2]?.cards ?? []]);
    const displayCards = [...sortAsc(trips.cards), ...kickers];

    return {
      type: LowHandType.THREE_OF_KIND,
      value: encode(
        LowHandType.THREE_OF_KIND,
        invertedLow(trips.cards[0]!),
        invertedLow(kickers[0]!),
        invertedLow(kickers[1]!),
      ),
      cards: displayCards,
      kickers,
      description:
        `Three of a Kind, ${plural(trips.cards[0]!.rank)}, ` +
        `${kickers.map(label).join("-")} kickers`,
    };
  }

  /** Two Pair. */
  private tryTwoPair(groups: LowGroup[]): LowHandRank | null {
    if (groups[0]!.cards.length !== 2 || groups[1]?.cards.length !== 2) return null;

    // groups[0] has the highest (worst in Razz) low value, groups[1] lower.
    const worsePair  = groups[0]!;
    const betterPair = groups[1]!;
    const kicker     = groups[2]!.cards;
    const displayCards = [...sortAsc(betterPair.cards), ...sortAsc(worsePair.cards), ...kicker];

    return {
      type: LowHandType.TWO_PAIR,
      value: encode(
        LowHandType.TWO_PAIR,
        invertedLow(worsePair.cards[0]!),   // worst pair is compared first (most significant)
        invertedLow(betterPair.cards[0]!),
        invertedLow(kicker[0]!),
      ),
      cards: displayCards,
      kickers: kicker,
      description:
        `Two Pair, ${plural(betterPair.cards[0]!.rank)} and ${plural(worsePair.cards[0]!.rank)}, ` +
        `${label(kicker[0]!)} kicker`,
    };
  }

  /** One Pair. */
  private tryPair(groups: LowGroup[]): LowHandRank | null {
    if (groups[0]!.cards.length !== 2 || (groups[1]?.cards.length ?? 0) > 1) return null;

    const pair    = groups[0]!;
    const kickers = sortAsc([
      ...groups[1]?.cards ?? [],
      ...groups[2]?.cards ?? [],
      ...groups[3]?.cards ?? [],
    ]);
    const displayCards = [...sortAsc(pair.cards), ...kickers];

    return {
      type: LowHandType.PAIR,
      value: encode(
        LowHandType.PAIR,
        invertedLow(pair.cards[0]!),
        invertedLow(kickers[0]!),
        invertedLow(kickers[1]!),
        invertedLow(kickers[2]!),
      ),
      cards: displayCards,
      kickers,
      description:
        `Pair of ${plural(pair.cards[0]!.rank)}, ` +
        `${kickers.map(label).join("-")} kicker${kickers.length > 1 ? "s" : ""}`,
    };
  }

  /**
   * No Pair — straights and flushes are **ignored** in Razz.
   *
   * A-2-3-4-5 (the "wheel") is the best possible Razz hand.
   * Cards are compared from highest (worst) to lowest (best) low value:
   * the hand with the lowest "worst card" wins; ties resolved down the line.
   */
  private buildNoPair(cards: Card[]): LowHandRank {
    // Sort descending so the "worst" card (highest low value) is first —
    // this card is the most significant for comparison purposes.
    const byWorstFirst = sortDesc(cards);
    // Display order: ascending (best/lowest card first — natural Razz notation).
    const display = sortAsc(cards);
    const notation = display.map(label).join("-");

    const [w1, w2, w3, w4, w5] = byWorstFirst;
    const isWheel =
      w1!.rank !== Rank.ACE && // already sorted by low value, ace can't be "worst" in wheel
      lowValue(w1!) === 5 &&
      lowValue(w2!) === 4 &&
      lowValue(w3!) === 3 &&
      lowValue(w4!) === 2 &&
      lowValue(w5!) === 1;

    const description = isWheel
      ? `Wheel (${notation})`
      : `${singular(w1!.rank)} low (${notation})`;

    return {
      type: LowHandType.NO_PAIR,
      value: encode(
        LowHandType.NO_PAIR,
        invertedLow(w1!),
        invertedLow(w2!),
        invertedLow(w3!),
        invertedLow(w4!),
        invertedLow(w5!),
      ),
      cards: display,
      kickers: [],
      description,
    };
  }
}

// ─── Standalone utilities ─────────────────────────────────────────────────────

/**
 * Compare two evaluated Razz hands.
 *
 * @returns
 * - Positive when `hand1` is **better** (lower in Razz terms) than `hand2`.
 * - Negative when `hand2` is better.
 * - `0` for an exact tie (chop pot).
 *
 * @example
 * const hands = players.map(p => LowHandEvaluator.best(p.cards));
 * hands.sort((a, b) => compareLowHands(b, a)); // best Razz hand first
 */
export function compareLowHands(hand1: LowHandRank, hand2: LowHandRank): number {
  return hand1.value - hand2.value;
}

/**
 * Type guard that narrows a `HandRank`-shaped object to `LowHandRank`.
 * Useful when working with a mixed array of high and low results.
 */
export function isLowHandRank(hand: HandRank | LowHandRank): hand is LowHandRank {
  return Object.values(LowHandType).includes((hand as LowHandRank).type as LowHandType);
}
