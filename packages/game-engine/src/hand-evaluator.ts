import type { Card, HandResult, HandRank, Rank } from "@csechbox/shared-types";

const RANK_VALUES: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

const HAND_SCORES: Record<HandRank, number> = {
  "high-card": 1,
  "one-pair": 2,
  "two-pair": 3,
  "three-of-a-kind": 4,
  "straight": 5,
  "flush": 6,
  "full-house": 7,
  "four-of-a-kind": 8,
  "straight-flush": 9,
  "royal-flush": 10,
};

export class HandEvaluator {
  /**
   * Evaluates the best 5-card hand from hole cards + community cards.
   */
  evaluate(holeCards: Card[], communityCards: Card[]): HandResult {
    const allCards = [...holeCards, ...communityCards];
    const combinations = this.getCombinations(allCards, 5);
    let best: HandResult | null = null;

    for (const combo of combinations) {
      const result = this.evaluateFive(combo);
      if (!best || result.score > best.score) {
        best = result;
      }
    }

    return best!;
  }

  private evaluateFive(cards: Card[]): HandResult {
    const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    const isFlush = sorted.every((c) => c.suit === sorted[0]!.suit);
    const isStraight = this.checkStraight(sorted);
    const rankGroups = this.groupByRank(sorted);
    const groupSizes = Object.values(rankGroups).map((g) => g.length).sort((a, b) => b - a);

    if (isFlush && isStraight && RANK_VALUES[sorted[0]!.rank] === 14) {
      return { rank: "royal-flush", cards: sorted, description: "Royal Flush", score: this.calcScore("royal-flush", sorted) };
    }
    if (isFlush && isStraight) {
      return { rank: "straight-flush", cards: sorted, description: "Straight Flush", score: this.calcScore("straight-flush", sorted) };
    }
    if (groupSizes[0] === 4) {
      return { rank: "four-of-a-kind", cards: sorted, description: "Four of a Kind", score: this.calcScore("four-of-a-kind", sorted) };
    }
    if (groupSizes[0] === 3 && groupSizes[1] === 2) {
      return { rank: "full-house", cards: sorted, description: "Full House", score: this.calcScore("full-house", sorted) };
    }
    if (isFlush) {
      return { rank: "flush", cards: sorted, description: "Flush", score: this.calcScore("flush", sorted) };
    }
    if (isStraight) {
      return { rank: "straight", cards: sorted, description: "Straight", score: this.calcScore("straight", sorted) };
    }
    if (groupSizes[0] === 3) {
      return { rank: "three-of-a-kind", cards: sorted, description: "Three of a Kind", score: this.calcScore("three-of-a-kind", sorted) };
    }
    if (groupSizes[0] === 2 && groupSizes[1] === 2) {
      return { rank: "two-pair", cards: sorted, description: "Two Pair", score: this.calcScore("two-pair", sorted) };
    }
    if (groupSizes[0] === 2) {
      return { rank: "one-pair", cards: sorted, description: "One Pair", score: this.calcScore("one-pair", sorted) };
    }
    return { rank: "high-card", cards: sorted, description: "High Card", score: this.calcScore("high-card", sorted) };
  }

  private checkStraight(sorted: Card[]): boolean {
    const vals = sorted.map((c) => RANK_VALUES[c.rank]);
    // Standard straight
    const isSeq = vals.every((v, i) => i === 0 || vals[i - 1]! - v === 1);
    if (isSeq) return true;
    // Ace-low straight (A-2-3-4-5)
    const aceLow = [14, 5, 4, 3, 2];
    return vals.every((v, i) => v === aceLow[i]);
  }

  private groupByRank(cards: Card[]): Record<string, Card[]> {
    return cards.reduce<Record<string, Card[]>>((acc, card) => {
      acc[card.rank] ??= [];
      acc[card.rank]!.push(card);
      return acc;
    }, {});
  }

  private calcScore(handRank: HandRank, cards: Card[]): number {
    const base = HAND_SCORES[handRank] * 1_000_000;
    const tieBreaker = cards.reduce((sum, c, i) => sum + RANK_VALUES[c.rank] * Math.pow(15, 4 - i), 0);
    return base + tieBreaker;
  }

  private getCombinations<T>(arr: T[], size: number): T[][] {
    if (size > arr.length) return [];
    if (size === arr.length) return [arr];
    if (size === 1) return arr.map((x) => [x]);

    const result: T[][] = [];
    for (let i = 0; i <= arr.length - size; i++) {
      const rest = this.getCombinations(arr.slice(i + 1), size - 1);
      for (const combo of rest) {
        result.push([arr[i]!, ...combo]);
      }
    }
    return result;
  }
}
