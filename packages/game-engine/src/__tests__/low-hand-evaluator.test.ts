import { LowHandEvaluator, LowHandType, compareLowHands } from "../low-hand-evaluator.js";
import type { LowHandRank } from "../low-hand-evaluator.js";
import { Card, Rank, Suit } from "../card.js";

// ─── Factory helpers ──────────────────────────────────────────────────────────

const c = (rank: Rank, suit: Suit): Card => new Card(rank, suit);
const S = Suit.SPADES;
const H = Suit.HEARTS;
const D = Suit.DIAMONDS;
const C = Suit.CLUBS;
const {
  ACE: RA, TWO: R2, THREE: R3, FOUR: R4, FIVE: R5,
  SIX: R6, SEVEN: R7, EIGHT: R8, NINE: R9, TEN: R10,
  JACK: RJ, QUEEN: RQ, KING: RK,
} = Rank;

const ev = new LowHandEvaluator();

function eval5(...cards: Card[]): LowHandRank {
  return ev.evaluateFive(cards as [Card, Card, Card, Card, Card]);
}

// ─── Wheel (best possible hand) ───────────────────────────────────────────────

describe("LowHandEvaluator — wheel (A-2-3-4-5)", () => {
  const wheel = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));

  it("classifies as NO_PAIR", () => {
    expect(wheel.type).toBe(LowHandType.NO_PAIR);
  });

  it("description starts with 'Wheel'", () => {
    expect(wheel.description).toMatch(/^Wheel/);
  });

  it("description contains A-2-3-4-5 notation", () => {
    expect(wheel.description).toContain("A-2-3-4-5");
  });

  it("has no kickers", () => {
    expect(wheel.kickers).toHaveLength(0);
  });

  it("returns exactly 5 cards", () => {
    expect(wheel.cards).toHaveLength(5);
  });

  it("displays cards in ascending Razz order (Ace first)", () => {
    expect(wheel.cards[0]!.rank).toBe(RA);
    expect(wheel.cards[4]!.rank).toBe(R5);
  });
});

// ─── Straights and flushes are IGNORED ───────────────────────────────────────

describe("LowHandEvaluator — straights and flushes are ignored", () => {
  it("A-2-3-4-5 suited is still NO_PAIR (not a straight flush)", () => {
    const hand = eval5(c(RA,H), c(R2,H), c(R3,H), c(R4,H), c(R5,H));
    expect(hand.type).toBe(LowHandType.NO_PAIR);
  });

  it("A-2-3-4-5 offsuit is still NO_PAIR (not a straight)", () => {
    const hand = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));
    expect(hand.type).toBe(LowHandType.NO_PAIR);
  });

  it("A-2-3-4-5 suited and offsuit have the SAME value", () => {
    const suited   = eval5(c(RA,H), c(R2,H), c(R3,H), c(R4,H), c(R5,H));
    const offsuit  = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));
    expect(suited.value).toBe(offsuit.value);
  });

  it("10-J-Q-K-A straight offsuit is NO_PAIR (not a straight)", () => {
    const hand = eval5(c(R10,S), c(RJ,H), c(RQ,D), c(RK,C), c(RA,S));
    expect(hand.type).toBe(LowHandType.NO_PAIR);
  });

  it("5-card same-suit non-sequential is still scored by rank groups only", () => {
    const flush = eval5(c(RA,H), c(R3,H), c(R5,H), c(R7,H), c(R9,H));
    expect(flush.type).toBe(LowHandType.NO_PAIR);
    expect(flush.description).toMatch(/Nine low/);
  });
});

// ─── Ace is always low ────────────────────────────────────────────────────────

describe("LowHandEvaluator — Ace is always low (value = 1)", () => {
  it("A-2-3-4-5 beats A-2-3-4-6 (5 low < 6 low)", () => {
    const wheel  = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));
    const sixLow = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R6,S));
    expect(wheel.value).toBeGreaterThan(sixLow.value);
  });

  it("A-2-3-4-5 beats A-2-3-5-K (wheel vs king-low)", () => {
    const wheel   = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));
    const kingLow = eval5(c(RA,S), c(R2,H), c(R3,D), c(R5,C), c(RK,S));
    expect(wheel.value).toBeGreaterThan(kingLow.value);
  });

  it("pair of Aces (low) beats pair of Twos in high terms but loses in Razz", () => {
    // In Razz, pair of Aces (A=1) is BETTER than pair of Twos
    const pairAces = eval5(c(RA,S), c(RA,H), c(R3,D), c(R5,C), c(R7,S));
    const pairTwos = eval5(c(R2,S), c(R2,H), c(R3,D), c(R5,C), c(R7,S));
    expect(pairAces.value).toBeGreaterThan(pairTwos.value);
  });

  it("A-A pair description shows 'Aces' not 'Ace high'", () => {
    const pairAces = eval5(c(RA,S), c(RA,H), c(R3,D), c(R5,C), c(R7,S));
    expect(pairAces.description).toContain("Aces");
  });
});

// ─── No-pair ordering ─────────────────────────────────────────────────────────

describe("LowHandEvaluator — no-pair ordering (lower worst card wins)", () => {
  it("A-2-3-4-5 beats A-2-3-4-6", () => {
    const a = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));
    const b = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R6,S));
    expect(a.value).toBeGreaterThan(b.value);
  });

  it("A-2-3-4-6 beats A-2-3-4-7", () => {
    const a = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R6,S));
    const b = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R7,S));
    expect(a.value).toBeGreaterThan(b.value);
  });

  it("A-2-4-5-6 beats A-2-3-5-7 (6-low beats 7-low)", () => {
    // Both are no-pair; highest card: 6 vs 7 → 6-low wins
    const sixLow   = eval5(c(RA,S), c(R2,H), c(R4,D), c(R5,C), c(R6,S));
    const sevenLow = eval5(c(RA,S), c(R2,H), c(R3,D), c(R5,C), c(R7,S));
    expect(sixLow.value).toBeGreaterThan(sevenLow.value);
  });

  it("tie-breaks by second-highest card when top cards match", () => {
    // Both 7-low; second card: 6 vs 5 → 5 is better
    const a = eval5(c(RA,S), c(R2,H), c(R3,D), c(R5,C), c(R7,S)); // 7-5
    const b = eval5(c(RA,S), c(R2,H), c(R3,D), c(R6,C), c(R7,S)); // 7-6
    expect(a.value).toBeGreaterThan(b.value);
  });

  it("identical hands produce equal values (chop)", () => {
    const a = eval5(c(RA,S), c(R2,H), c(R3,D), c(R5,C), c(R7,S));
    const b = eval5(c(RA,H), c(R2,D), c(R3,C), c(R5,S), c(R7,H));
    expect(a.value).toBe(b.value);
  });

  it("no-pair always beats any paired hand", () => {
    const noPair = eval5(c(RK,S), c(RQ,H), c(RJ,D), c(R10,C), c(R9,S)); // king-high — worst no-pair
    const pair   = eval5(c(R2,S), c(R2,H), c(RA,D),  c(R3,C),  c(R4,S)); // pair of 2s — best pair
    expect(noPair.value).toBeGreaterThan(pair.value);
  });
});

// ─── No-pair description ──────────────────────────────────────────────────────

describe("LowHandEvaluator — no-pair descriptions", () => {
  it("A-2-3-4-5 → 'Wheel (A-2-3-4-5)'", () => {
    expect(eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S)).description)
      .toBe("Wheel (A-2-3-4-5)");
  });

  it("A-2-3-4-6 → 'Six low (A-2-3-4-6)'", () => {
    expect(eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R6,S)).description)
      .toBe("Six low (A-2-3-4-6)");
  });

  it("A-2-3-5-8 → 'Eight low (A-2-3-5-8)'", () => {
    expect(eval5(c(RA,S), c(R2,H), c(R3,D), c(R5,C), c(R8,S)).description)
      .toBe("Eight low (A-2-3-5-8)");
  });

  it("9-8-7-6-5 → 'Nine low (5-6-7-8-9)'", () => {
    expect(eval5(c(R9,S), c(R8,H), c(R7,D), c(R6,C), c(R5,S)).description)
      .toBe("Nine low (5-6-7-8-9)");
  });

  it("K-Q-J-10-9 → 'King low (...)'", () => {
    expect(eval5(c(RK,S), c(RQ,H), c(RJ,D), c(R10,C), c(R9,S)).description)
      .toMatch(/^King low/);
  });
});

// ─── Pair hands ───────────────────────────────────────────────────────────────

describe("LowHandEvaluator — pair hands", () => {
  it("pair of 2s beats pair of 3s", () => {
    const twos   = eval5(c(R2,S), c(R2,H), c(RA,D), c(R3,C), c(R4,S));
    const threes = eval5(c(R3,S), c(R3,H), c(RA,D), c(R2,C), c(R4,S));
    expect(twos.value).toBeGreaterThan(threes.value);
  });

  it("pair of Aces beats pair of 2s (A=1 in Razz)", () => {
    const aces = eval5(c(RA,S), c(RA,H), c(R2,D), c(R3,C), c(R4,S));
    const twos = eval5(c(R2,S), c(R2,H), c(RA,D), c(R3,C), c(R4,S));
    expect(aces.value).toBeGreaterThan(twos.value);
  });

  it("same pair rank: lower kickers win", () => {
    const lowKick  = eval5(c(R5,S), c(R5,H), c(RA,D), c(R2,C), c(R3,S)); // 5-5, A-2-3
    const highKick = eval5(c(R5,S), c(R5,H), c(RA,D), c(R2,C), c(R4,S)); // 5-5, A-2-4
    expect(lowKick.value).toBeGreaterThan(highKick.value);
  });

  it("type is PAIR", () => {
    expect(eval5(c(R7,S), c(R7,H), c(RA,D), c(R2,C), c(R3,S)).type)
      .toBe(LowHandType.PAIR);
  });

  it("has 3 kickers", () => {
    expect(eval5(c(R7,S), c(R7,H), c(RA,D), c(R2,C), c(R3,S)).kickers)
      .toHaveLength(3);
  });

  it("kickers are sorted ascending (Ace first)", () => {
    const result = eval5(c(R7,S), c(R7,H), c(RA,D), c(R5,C), c(R3,S));
    const kickerLowVals = result.kickers.map((k) => (k.rank === Rank.ACE ? 1 : k.value));
    expect(kickerLowVals).toEqual([...kickerLowVals].sort((a, b) => a - b));
  });

  it("pair description — 'Pair of Sevens, A-3-5 kickers'", () => {
    expect(eval5(c(R7,S), c(R7,H), c(RA,D), c(R3,C), c(R5,S)).description)
      .toBe("Pair of Sevens, A-3-5 kickers");
  });
});

// ─── Two pair hands ───────────────────────────────────────────────────────────

describe("LowHandEvaluator — two pair hands", () => {
  it("type is TWO_PAIR", () => {
    expect(eval5(c(R2,S), c(R2,H), c(R3,D), c(R3,C), c(RA,S)).type)
      .toBe(LowHandType.TWO_PAIR);
  });

  it("2s and 3s beats 2s and 4s (lower second pair wins)", () => {
    const twosThrees = eval5(c(R2,S), c(R2,H), c(R3,D), c(R3,C), c(RA,S));
    const twosFours  = eval5(c(R2,S), c(R2,H), c(R4,D), c(R4,C), c(RA,S));
    expect(twosThrees.value).toBeGreaterThan(twosFours.value);
  });

  it("any two-pair is worse than any one-pair", () => {
    const bestTwoPair = eval5(c(RA,S), c(RA,H), c(R2,D), c(R2,C), c(R3,S));
    const worstPair   = eval5(c(RK,S), c(RK,H), c(RQ,D), c(RJ,C), c(R10,S));
    expect(worstPair.value).toBeGreaterThan(bestTwoPair.value);
  });

  it("two-pair description — 'Two Pair, Twos and Threes, Ace kicker'", () => {
    expect(eval5(c(R2,S), c(R2,H), c(R3,D), c(R3,C), c(RA,S)).description)
      .toBe("Two Pair, Twos and Threes, Ace kicker");
  });

  it("has 1 kicker", () => {
    expect(eval5(c(R2,S), c(R2,H), c(R3,D), c(R3,C), c(RA,S)).kickers)
      .toHaveLength(1);
  });
});

// ─── Three of a kind ─────────────────────────────────────────────────────────

describe("LowHandEvaluator — three of a kind", () => {
  it("type is THREE_OF_KIND", () => {
    expect(eval5(c(R4,S), c(R4,H), c(R4,D), c(RA,C), c(R2,S)).type)
      .toBe(LowHandType.THREE_OF_KIND);
  });

  it("trip Aces beats trip Twos (A=1 in Razz)", () => {
    const tripAces = eval5(c(RA,S), c(RA,H), c(RA,D), c(R2,C), c(R3,S));
    const tripTwos = eval5(c(R2,S), c(R2,H), c(R2,D), c(RA,C), c(R3,S));
    expect(tripAces.value).toBeGreaterThan(tripTwos.value);
  });

  it("any trips is worse than any two-pair", () => {
    const bestTrips  = eval5(c(RA,S), c(RA,H), c(RA,D), c(R2,C), c(R3,S));
    const worstTwoPair = eval5(c(RK,S), c(RK,H), c(RQ,D), c(RQ,C), c(RJ,S));
    expect(worstTwoPair.value).toBeGreaterThan(bestTrips.value);
  });

  it("has 2 kickers", () => {
    expect(eval5(c(R4,S), c(R4,H), c(R4,D), c(RA,C), c(R2,S)).kickers)
      .toHaveLength(2);
  });
});

// ─── Full house ───────────────────────────────────────────────────────────────

describe("LowHandEvaluator — full house", () => {
  it("type is FULL_HOUSE", () => {
    expect(eval5(c(R2,S), c(R2,H), c(R2,D), c(R3,C), c(R3,S)).type)
      .toBe(LowHandType.FULL_HOUSE);
  });

  it("A-A-A-2-2 beats 2-2-2-A-A (lower trip rank wins)", () => {
    const tripAces = eval5(c(RA,S), c(RA,H), c(RA,D), c(R2,C), c(R2,S));
    const tripTwos = eval5(c(R2,S), c(R2,H), c(R2,D), c(RA,C), c(RA,S));
    expect(tripAces.value).toBeGreaterThan(tripTwos.value);
  });

  it("any full house is worse than any trips", () => {
    const bestFH    = eval5(c(RA,S), c(RA,H), c(RA,D), c(R2,C), c(R2,S));
    const worstTrip = eval5(c(RK,S), c(RK,H), c(RK,D), c(RQ,C), c(RJ,S));
    expect(worstTrip.value).toBeGreaterThan(bestFH.value);
  });
});

// ─── Four of a kind ───────────────────────────────────────────────────────────

describe("LowHandEvaluator — four of a kind (worst hand)", () => {
  it("type is FOUR_OF_KIND", () => {
    expect(eval5(c(R2,S), c(R2,H), c(R2,D), c(R2,C), c(RA,S)).type)
      .toBe(LowHandType.FOUR_OF_KIND);
  });

  it("quad Aces beats quad Twos (A=1 in Razz)", () => {
    const quadAces = eval5(c(RA,S), c(RA,H), c(RA,D), c(RA,C), c(R2,S));
    const quadTwos = eval5(c(R2,S), c(R2,H), c(R2,D), c(R2,C), c(RA,S));
    expect(quadAces.value).toBeGreaterThan(quadTwos.value);
  });

  it("is worse than any full house", () => {
    const bestQuad = eval5(c(RA,S), c(RA,H), c(RA,D), c(RA,C), c(R2,S));
    const worstFH  = eval5(c(RK,S), c(RK,H), c(RK,D), c(RQ,C), c(RQ,S));
    expect(worstFH.value).toBeGreaterThan(bestQuad.value);
  });

  it("has 1 kicker", () => {
    expect(eval5(c(R2,S), c(R2,H), c(R2,D), c(R2,C), c(RA,S)).kickers)
      .toHaveLength(1);
  });
});

// ─── Full category ranking order ─────────────────────────────────────────────

describe("LowHandEvaluator — full ranking order (best → worst)", () => {
  const hands = [
    eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S)),   // wheel — best
    eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R6,S)),   // 6-low
    eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(RK,S)),   // K-low (worst no-pair)
    eval5(c(RA,S), c(RA,H), c(R2,D), c(R3,C), c(R4,S)),   // best pair (A-A)
    eval5(c(RK,S), c(RK,H), c(RQ,D), c(RJ,C), c(R10,S)),  // worst pair (K-K)
    eval5(c(RA,S), c(RA,H), c(R2,D), c(R2,C), c(R3,S)),   // best two-pair (A-A, 2-2)
    eval5(c(RK,S), c(RK,H), c(RQ,D), c(RQ,C), c(RJ,S)),   // worst two-pair
    eval5(c(RA,S), c(RA,H), c(RA,D), c(R2,C), c(R3,S)),   // best trips (A-A-A)
    eval5(c(RK,S), c(RK,H), c(RK,D), c(RQ,C), c(RJ,S)),   // worst trips
    eval5(c(RA,S), c(RA,H), c(RA,D), c(R2,C), c(R2,S)),   // best full house
    eval5(c(RK,S), c(RK,H), c(RK,D), c(RQ,C), c(RQ,S)),   // worst full house
    eval5(c(RA,S), c(RA,H), c(RA,D), c(RA,C), c(R2,S)),   // best quads
    eval5(c(RK,S), c(RK,H), c(RK,D), c(RK,C), c(RQ,S)),   // worst quads — worst hand
  ];

  it("each hand is strictly better than the next", () => {
    for (let i = 1; i < hands.length; i++) {
      expect(hands[i - 1]!.value).toBeGreaterThan(hands[i]!.value);
    }
  });

  it("category types appear in the expected order", () => {
    const types = hands.map((h) => h.type);
    const noPairs     = types.filter((t) => t === LowHandType.NO_PAIR);
    const pairs       = types.filter((t) => t === LowHandType.PAIR);
    const twoPairs    = types.filter((t) => t === LowHandType.TWO_PAIR);
    const trips       = types.filter((t) => t === LowHandType.THREE_OF_KIND);
    const fullHouses  = types.filter((t) => t === LowHandType.FULL_HOUSE);
    const quads       = types.filter((t) => t === LowHandType.FOUR_OF_KIND);

    expect(noPairs).toHaveLength(3);
    expect(pairs).toHaveLength(2);
    expect(twoPairs).toHaveLength(2);
    expect(trips).toHaveLength(2);
    expect(fullHouses).toHaveLength(2);
    expect(quads).toHaveLength(2);
  });
});

// ─── 7-card evaluation (best = lowest) ───────────────────────────────────────

describe("LowHandEvaluator — 7-card best-hand selection", () => {
  it("finds the wheel from 7 cards when possible", () => {
    const result = ev.evaluate([
      c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S), c(RK,H), c(RQ,D),
    ]);
    expect(result.type).toBe(LowHandType.NO_PAIR);
    expect(result.description).toMatch(/^Wheel/);
  });

  it("avoids the pair when a better 5-card no-pair exists", () => {
    // 7 cards include a pair of 8s but also 5 low cards → should pick no-pair
    const result = ev.evaluate([
      c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S), c(R8,H), c(R8,D),
    ]);
    expect(result.type).toBe(LowHandType.NO_PAIR);
  });

  it("returns the best available no-pair from multiple 5-card combos", () => {
    const result = ev.evaluate([
      c(RA,S), c(R2,H), c(R3,D), c(R6,C), c(R7,S), c(R4,H), c(R5,D),
    ]);
    // Best 5 = A-2-3-4-5 (wheel)
    expect(result.description).toMatch(/^Wheel/);
  });

  it("static LowHandEvaluator.best() works with two arrays", () => {
    const hole      = [c(RA,S), c(R2,H)];
    const community = [c(R3,D), c(R4,C), c(R5,S), c(RK,H), c(RQ,D)];
    const result = LowHandEvaluator.best(hole, community);
    expect(result.type).toBe(LowHandType.NO_PAIR);
    expect(result.description).toMatch(/^Wheel/);
  });

  it("throws when fewer than 5 cards are given", () => {
    expect(() => ev.evaluate([c(RA,S), c(R2,H), c(R3,D), c(R4,C)])).toThrow(RangeError);
  });
});

// ─── compareLowHands() ───────────────────────────────────────────────────────

describe("compareLowHands()", () => {
  const wheel  = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));
  const sixLow = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R6,S));
  const pair   = eval5(c(R2,S), c(R2,H), c(RA,D), c(R3,C), c(R4,S));

  it("returns positive when hand1 is better", () => {
    expect(compareLowHands(wheel, sixLow)).toBeGreaterThan(0);
  });

  it("returns negative when hand2 is better", () => {
    expect(compareLowHands(sixLow, wheel)).toBeLessThan(0);
  });

  it("returns 0 for equal hands", () => {
    const a = eval5(c(RA,S), c(R2,H), c(R3,D), c(R4,C), c(R5,S));
    const b = eval5(c(RA,H), c(R2,D), c(R3,C), c(R4,S), c(R5,H));
    expect(compareLowHands(a, b)).toBe(0);
  });

  it("sorts an array best (lowest) Razz hand first", () => {
    const hands: LowHandRank[] = [pair, sixLow, wheel];
    hands.sort((a, b) => compareLowHands(b, a));
    expect(hands[0]!.type).toBe(LowHandType.NO_PAIR);
    expect(hands[0]!.description).toMatch(/^Wheel/);
    expect(hands.at(-1)!.type).toBe(LowHandType.PAIR);
  });
});
