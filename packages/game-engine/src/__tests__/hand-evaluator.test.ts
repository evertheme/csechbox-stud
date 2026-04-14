import { HandEvaluator, HandType, compareHands } from "../hand-evaluator.js";
import type { HandRank } from "../hand-evaluator.js";
import { Card, Rank, Suit } from "../card.js";

// ─── Factory helper ───────────────────────────────────────────────────────────

const c = (rank: Rank, suit: Suit): Card => new Card(rank, suit);
const S = Suit.SPADES;
const H = Suit.HEARTS;
const D = Suit.DIAMONDS;
const C = Suit.CLUBS;
const { TWO: R2, THREE: R3, FOUR: R4, FIVE: R5, SIX: R6,
        SEVEN: R7, EIGHT: R8, NINE: R9, TEN: R10,
        JACK: RJ, QUEEN: RQ, KING: RK, ACE: RA } = Rank;

// ─── 5-card evaluation fixtures ──────────────────────────────────────────────

const HANDS = {
  royalFlush:    [c(RA,S), c(RK,S), c(RQ,S), c(RJ,S), c(R10,S)],
  straightFlush: [c(R9,H), c(R8,H), c(R7,H), c(R6,H), c(R5,H)],
  wheelFlush:    [c(RA,D), c(R5,D), c(R4,D), c(R3,D), c(R2,D)],
  fourAces:      [c(RA,S), c(RA,H), c(RA,D), c(RA,C), c(RK,S)],
  fourTwos:      [c(R2,S), c(R2,H), c(R2,D), c(R2,C), c(RA,S)],
  fullHouseKK10: [c(RK,S), c(RK,H), c(RK,D), c(R10,S), c(R10,H)],
  fullHouseAA9:  [c(RA,S), c(RA,H), c(RA,D), c(R9,S),  c(R9,H)],
  flushAceHigh:  [c(RA,C), c(RJ,C), c(R9,C), c(R6,C), c(R2,C)],
  straightKing:  [c(RK,S), c(RQ,H), c(RJ,D), c(R10,C), c(R9,S)],
  straightWheel: [c(RA,S), c(R5,H), c(R4,D), c(R3,C),  c(R2,S)],
  threeQQ:       [c(RQ,S), c(RQ,H), c(RQ,D), c(RK,C), c(RJ,S)],
  twoPairAK:     [c(RA,S), c(RA,H), c(RK,D), c(RK,C), c(R10,S)],
  pairJacks:     [c(RJ,S), c(RJ,H), c(RA,D), c(RK,C), c(RQ,S)],
  highCardAce:   [c(RA,S), c(RK,H), c(RQ,D), c(RJ,C), c(R9,S)],
} satisfies Record<string, Card[]>;

// ─── Hand type classification ─────────────────────────────────────────────────

describe("HandEvaluator — hand type classification", () => {
  const E = new HandEvaluator();

  it.each([
    ["royalFlush",    HandType.ROYAL_FLUSH],
    ["straightFlush", HandType.STRAIGHT_FLUSH],
    ["wheelFlush",    HandType.STRAIGHT_FLUSH],
    ["fourAces",      HandType.FOUR_OF_KIND],
    ["fourTwos",      HandType.FOUR_OF_KIND],
    ["fullHouseKK10", HandType.FULL_HOUSE],
    ["fullHouseAA9",  HandType.FULL_HOUSE],
    ["flushAceHigh",  HandType.FLUSH],
    ["straightKing",  HandType.STRAIGHT],
    ["straightWheel", HandType.STRAIGHT],
    ["threeQQ",       HandType.THREE_OF_KIND],
    ["twoPairAK",     HandType.TWO_PAIR],
    ["pairJacks",     HandType.PAIR],
    ["highCardAce",   HandType.HIGH_CARD],
  ] as [keyof typeof HANDS, HandType][])(
    "%s → HandType.%s",
    (key, expected) => {
      const result = E.evaluate(HANDS[key] as [Card,Card,Card,Card,Card]);
      expect(result.type).toBe(expected);
    },
  );
});

// ─── Cards & kickers shape ────────────────────────────────────────────────────

describe("HandEvaluator — cards and kickers", () => {
  const E = new HandEvaluator();

  it("always returns exactly 5 cards", () => {
    for (const hand of Object.values(HANDS)) {
      expect(E.evaluate(hand as [Card,Card,Card,Card,Card]).cards).toHaveLength(5);
    }
  });

  it("four of a kind has 1 kicker", () => {
    expect(E.evaluate(HANDS.fourAces as [Card,Card,Card,Card,Card]).kickers).toHaveLength(1);
  });

  it("full house has no kickers", () => {
    expect(E.evaluate(HANDS.fullHouseKK10 as [Card,Card,Card,Card,Card]).kickers).toHaveLength(0);
  });

  it("flush has no kickers", () => {
    expect(E.evaluate(HANDS.flushAceHigh as [Card,Card,Card,Card,Card]).kickers).toHaveLength(0);
  });

  it("straight has no kickers", () => {
    expect(E.evaluate(HANDS.straightKing as [Card,Card,Card,Card,Card]).kickers).toHaveLength(0);
  });

  it("three of a kind has 2 kickers", () => {
    expect(E.evaluate(HANDS.threeQQ as [Card,Card,Card,Card,Card]).kickers).toHaveLength(2);
  });

  it("two pair has 1 kicker", () => {
    expect(E.evaluate(HANDS.twoPairAK as [Card,Card,Card,Card,Card]).kickers).toHaveLength(1);
  });

  it("pair has 3 kickers", () => {
    expect(E.evaluate(HANDS.pairJacks as [Card,Card,Card,Card,Card]).kickers).toHaveLength(3);
  });

  it("high card has 4 kickers", () => {
    expect(E.evaluate(HANDS.highCardAce as [Card,Card,Card,Card,Card]).kickers).toHaveLength(4);
  });

  it("full house — trips appear before pair in cards array", () => {
    const result = E.evaluate(HANDS.fullHouseKK10 as [Card,Card,Card,Card,Card]);
    expect(result.cards.slice(0, 3).every((c) => c.rank === RK)).toBe(true);
    expect(result.cards.slice(3).every((c) => c.rank === R10)).toBe(true);
  });

  it("pair — pair appears first in cards array", () => {
    const result = E.evaluate(HANDS.pairJacks as [Card,Card,Card,Card,Card]);
    expect(result.cards[0]!.rank).toBe(RJ);
    expect(result.cards[1]!.rank).toBe(RJ);
  });

  it("kickers are sorted descending by value", () => {
    const result = E.evaluate(HANDS.pairJacks as [Card,Card,Card,Card,Card]);
    const vals = result.kickers.map((k) => k.value);
    expect(vals).toEqual([...vals].sort((a, b) => b - a));
  });
});

// ─── Descriptions ─────────────────────────────────────────────────────────────

describe("HandEvaluator — descriptions", () => {
  const E = new HandEvaluator();

  it("Royal Flush → 'Royal Flush'", () => {
    expect(E.evaluate(HANDS.royalFlush as [Card,Card,Card,Card,Card]).description)
      .toBe("Royal Flush");
  });

  it("Straight Flush → 'Straight Flush, Nine high'", () => {
    expect(E.evaluate(HANDS.straightFlush as [Card,Card,Card,Card,Card]).description)
      .toBe("Straight Flush, Nine high");
  });

  it("Wheel straight flush → 'Straight Flush, Five high'", () => {
    expect(E.evaluate(HANDS.wheelFlush as [Card,Card,Card,Card,Card]).description)
      .toBe("Straight Flush, Five high");
  });

  it("Four of a Kind Aces → 'Four of a Kind, Aces'", () => {
    expect(E.evaluate(HANDS.fourAces as [Card,Card,Card,Card,Card]).description)
      .toBe("Four of a Kind, Aces");
  });

  it("Full House → 'Full House, Kings over Tens'", () => {
    expect(E.evaluate(HANDS.fullHouseKK10 as [Card,Card,Card,Card,Card]).description)
      .toBe("Full House, Kings over Tens");
  });

  it("Flush → 'Flush, Ace high'", () => {
    expect(E.evaluate(HANDS.flushAceHigh as [Card,Card,Card,Card,Card]).description)
      .toBe("Flush, Ace high");
  });

  it("Straight → 'Straight, King high'", () => {
    expect(E.evaluate(HANDS.straightKing as [Card,Card,Card,Card,Card]).description)
      .toBe("Straight, King high");
  });

  it("Wheel straight → 'Straight, Five high'", () => {
    expect(E.evaluate(HANDS.straightWheel as [Card,Card,Card,Card,Card]).description)
      .toBe("Straight, Five high");
  });

  it("Three of a Kind → 'Three of a Kind, Queens'", () => {
    expect(E.evaluate(HANDS.threeQQ as [Card,Card,Card,Card,Card]).description)
      .toBe("Three of a Kind, Queens");
  });

  it("Two Pair → 'Two Pair, Aces and Kings, Ten kicker'", () => {
    expect(E.evaluate(HANDS.twoPairAK as [Card,Card,Card,Card,Card]).description)
      .toBe("Two Pair, Aces and Kings, Ten kicker");
  });

  it("Pair → 'Pair of Jacks, Ace-King-Queen kickers'", () => {
    expect(E.evaluate(HANDS.pairJacks as [Card,Card,Card,Card,Card]).description)
      .toBe("Pair of Jacks, Ace-King-Queen kickers");
  });

  it("High Card → 'Ace high, King-Queen-Jack-Nine kickers'", () => {
    expect(E.evaluate(HANDS.highCardAce as [Card,Card,Card,Card,Card]).description)
      .toBe("Ace high, King-Queen-Jack-Nine kickers");
  });
});

// ─── Ace-low / wheel edge cases ───────────────────────────────────────────────

describe("HandEvaluator — ace-low straight (wheel)", () => {
  const E = new HandEvaluator();

  it("wheel is a straight", () => {
    expect(E.evaluate(HANDS.straightWheel as [Card,Card,Card,Card,Card]).type)
      .toBe(HandType.STRAIGHT);
  });

  it("wheel value is lower than a six-high straight", () => {
    const wheel  = E.evaluate(HANDS.straightWheel as [Card,Card,Card,Card,Card]);
    const sixHigh = E.evaluate([c(R6,S), c(R5,H), c(R4,D), c(R3,C), c(R2,H)] as [Card,Card,Card,Card,Card]);
    expect(wheel.value).toBeLessThan(sixHigh.value);
  });

  it("wheel straight flush is lower than a 6-high straight flush", () => {
    const wheel   = E.evaluate(HANDS.wheelFlush as [Card,Card,Card,Card,Card]);
    const sixHigh = E.evaluate([c(R6,H), c(R5,H), c(R4,H), c(R3,H), c(R2,H)] as [Card,Card,Card,Card,Card]);
    expect(wheel.value).toBeLessThan(sixHigh.value);
  });

  it("wheel display order ends with the Ace", () => {
    const result = E.evaluate(HANDS.straightWheel as [Card,Card,Card,Card,Card]);
    expect(result.cards.at(-1)!.rank).toBe(RA);
  });
});

// ─── Hand ranking order ───────────────────────────────────────────────────────

describe("HandEvaluator — ranking order", () => {
  const E = new HandEvaluator();

  const ordered: (keyof typeof HANDS)[] = [
    "highCardAce", "pairJacks", "twoPairAK",
    "threeQQ", "straightWheel", "straightKing",
    "flushAceHigh", "fullHouseKK10", "fourTwos",
    "fourAces", "straightFlush", "royalFlush",
  ];

  it("each hand ranks strictly above the previous one", () => {
    const results = ordered.map((k) =>
      E.evaluate(HANDS[k] as [Card,Card,Card,Card,Card]),
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.value).toBeGreaterThan(results[i - 1]!.value);
    }
  });
});

// ─── 7-card best-hand selection ───────────────────────────────────────────────

describe("HandEvaluator — 7-card best-hand (Texas Hold'em)", () => {
  const E = new HandEvaluator();

  it("finds the royal flush from 7 cards", () => {
    const hole      = [c(RA,S), c(RK,S)];
    const community = [c(RQ,S), c(RJ,S), c(R10,S), c(R2,H), c(R3,C)];
    expect(E.evaluate(hole, community).type).toBe(HandType.ROYAL_FLUSH);
  });

  it("picks the flush over a pair when 7 cards include both", () => {
    const hole      = [c(RA,C), c(RK,H)];
    const community = [c(RJ,C), c(R9,C), c(R6,C), c(R2,C), c(RK,D)];
    expect(E.evaluate(hole, community).type).toBe(HandType.FLUSH);
  });

  it("picks the best pair when two pairs are available", () => {
    const hole      = [c(RA,S), c(RA,H)];
    const community = [c(RK,S), c(RK,H), c(R2,D), c(R3,C), c(R4,S)];
    expect(E.evaluate(hole, community).type).toBe(HandType.TWO_PAIR);
  });

  it("evaluates exactly the best 5 from 7", () => {
    // Hole: A♠ K♠
    // Community: Q♠ J♠ 10♠ 2♥ 3♣ → best is royal flush in spades
    const result = E.evaluate(
      [c(RA,S), c(RK,S)],
      [c(RQ,S), c(RJ,S), c(R10,S), c(R2,H), c(R3,C)],
    );
    expect(result.cards).toHaveLength(5);
    expect(result.type).toBe(HandType.ROYAL_FLUSH);
  });

  it("generates all 21 5-card combos from 7 cards (static best)", () => {
    const all7 = [
      c(RA,S), c(RK,S), c(RQ,S), c(RJ,S),
      c(R10,S), c(R2,H), c(R3,C),
    ];
    const result = HandEvaluator.best(all7);
    expect(result.type).toBe(HandType.ROYAL_FLUSH);
  });

  it("throws when fewer than 5 cards are given", () => {
    expect(() => E.evaluate([c(RA,S), c(RK,S), c(RQ,S), c(RJ,S)])).toThrow(RangeError);
  });
});

// ─── Tiebreaking ──────────────────────────────────────────────────────────────

describe("HandEvaluator — tiebreaking", () => {
  const E = new HandEvaluator();

  it("pair of Aces beats pair of Kings", () => {
    const aces  = E.evaluate([c(RA,S), c(RA,H), c(RQ,D), c(RJ,C), c(R10,S)] as [Card,Card,Card,Card,Card]);
    const kings = E.evaluate([c(RK,S), c(RK,H), c(RQ,D), c(RJ,C), c(R10,S)] as [Card,Card,Card,Card,Card]);
    expect(aces.value).toBeGreaterThan(kings.value);
  });

  it("pair with Ace kicker beats pair with King kicker", () => {
    const aceKick  = E.evaluate([c(RJ,S), c(RJ,H), c(RA,D), c(R9,C), c(R8,S)] as [Card,Card,Card,Card,Card]);
    const kingKick = E.evaluate([c(RJ,S), c(RJ,H), c(RK,D), c(R9,C), c(R8,S)] as [Card,Card,Card,Card,Card]);
    expect(aceKick.value).toBeGreaterThan(kingKick.value);
  });

  it("flush with King-high beats flush with Queen-high", () => {
    const kingFlush  = E.evaluate([c(RK,H), c(RJ,H), c(R9,H), c(R7,H), c(R5,H)] as [Card,Card,Card,Card,Card]);
    const queenFlush = E.evaluate([c(RQ,H), c(RJ,H), c(R9,H), c(R7,H), c(R5,H)] as [Card,Card,Card,Card,Card]);
    expect(kingFlush.value).toBeGreaterThan(queenFlush.value);
  });

  it("identical hands produce the same value (chop)", () => {
    const hand1 = E.evaluate([c(RA,S), c(RK,H), c(RQ,D), c(RJ,C), c(R9,S)] as [Card,Card,Card,Card,Card]);
    const hand2 = E.evaluate([c(RA,H), c(RK,D), c(RQ,C), c(RJ,S), c(R9,H)] as [Card,Card,Card,Card,Card]);
    expect(hand1.value).toBe(hand2.value);
  });

  it("four of a kind — quad rank tiebreaker (Aces beat Twos)", () => {
    const aces = E.evaluate(HANDS.fourAces as [Card,Card,Card,Card,Card]);
    const twos = E.evaluate(HANDS.fourTwos as [Card,Card,Card,Card,Card]);
    expect(aces.value).toBeGreaterThan(twos.value);
  });

  it("full house — trip rank tiebreaker (AAA99 beats KKK10 )", () => {
    const aa9  = E.evaluate(HANDS.fullHouseAA9  as [Card,Card,Card,Card,Card]);
    const kk10 = E.evaluate(HANDS.fullHouseKK10 as [Card,Card,Card,Card,Card]);
    expect(aa9.value).toBeGreaterThan(kk10.value);
  });
});

// ─── compareHands utility ─────────────────────────────────────────────────────

describe("compareHands()", () => {
  const E = new HandEvaluator();

  it("returns positive when hand1 beats hand2", () => {
    const rf   = E.evaluate(HANDS.royalFlush   as [Card,Card,Card,Card,Card]);
    const pair = E.evaluate(HANDS.pairJacks     as [Card,Card,Card,Card,Card]);
    expect(compareHands(rf, pair)).toBeGreaterThan(0);
  });

  it("returns negative when hand2 beats hand1", () => {
    const pair = E.evaluate(HANDS.pairJacks   as [Card,Card,Card,Card,Card]);
    const rf   = E.evaluate(HANDS.royalFlush  as [Card,Card,Card,Card,Card]);
    expect(compareHands(pair, rf)).toBeLessThan(0);
  });

  it("returns 0 for equal hands", () => {
    const a = E.evaluate([c(RA,S), c(RK,H), c(RQ,D), c(RJ,C), c(R9,S)] as [Card,Card,Card,Card,Card]);
    const b = E.evaluate([c(RA,H), c(RK,D), c(RQ,C), c(RJ,S), c(R9,H)] as [Card,Card,Card,Card,Card]);
    expect(compareHands(a, b)).toBe(0);
  });

  it("can sort an array of hands highest first", () => {
    const hands: HandRank[] = [
      E.evaluate(HANDS.highCardAce   as [Card,Card,Card,Card,Card]),
      E.evaluate(HANDS.royalFlush    as [Card,Card,Card,Card,Card]),
      E.evaluate(HANDS.pairJacks     as [Card,Card,Card,Card,Card]),
      E.evaluate(HANDS.flushAceHigh  as [Card,Card,Card,Card,Card]),
    ];
    hands.sort((a, b) => compareHands(b, a));
    expect(hands[0]!.type).toBe(HandType.ROYAL_FLUSH);
    expect(hands.at(-1)!.type).toBe(HandType.HIGH_CARD);
  });
});
