import { Deck } from "../deck.js";
import { Card, Rank, Suit } from "../card.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deckSignature(deck: Deck): string {
  // Deal all cards to record order, then restore
  const cards = deck.deal(52);
  deck.reset();
  return cards.map((c) => c.toString()).join(",");
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe("Deck — construction", () => {
  it("starts with exactly 52 cards", () => {
    expect(new Deck().cardsRemaining).toBe(52);
  });

  it("starts non-empty", () => {
    expect(new Deck().isEmpty).toBe(false);
  });

  it("contains all 52 unique cards", () => {
    const deck  = new Deck();
    const cards = deck.deal(52);
    const keys  = new Set(cards.map((c) => c.toString()));
    expect(keys.size).toBe(52);
  });
});

// ─── shuffle() ────────────────────────────────────────────────────────────────

describe("Deck — shuffle()", () => {
  it("returns the same Deck instance (chainable)", () => {
    const deck = new Deck();
    expect(deck.shuffle()).toBe(deck);
  });

  it("changes the card order with overwhelming probability", () => {
    const deck = new Deck();
    const before = deckSignature(deck);
    deck.shuffle();
    const after = deckSignature(deck);
    // The chance of an identical order is 1/52! — effectively impossible
    expect(after).not.toBe(before);
  });

  it("preserves all 52 cards after shuffle", () => {
    const deck = new Deck().shuffle();
    expect(deck.cardsRemaining).toBe(52);
    const keys = new Set(deck.deal(52).map((c) => c.toString()));
    expect(keys.size).toBe(52);
  });

  it("produces different orderings on successive shuffles", () => {
    const deck   = new Deck();
    const order1 = deckSignature(deck);
    deck.shuffle();
    const order2 = deckSignature(deck);
    expect(order1).not.toBe(order2);
  });
});

// ─── deal() — single card ─────────────────────────────────────────────────────

describe("Deck — deal() single card", () => {
  it("returns a Card instance", () => {
    const card = new Deck().deal();
    expect(card).toBeInstanceOf(Card);
  });

  it("removes the top card", () => {
    const deck = new Deck();
    deck.deal();
    expect(deck.cardsRemaining).toBe(51);
  });

  it("throws when the deck is empty", () => {
    const deck = new Deck();
    deck.deal(52);
    expect(() => deck.deal()).toThrow("Cannot deal from an empty deck.");
  });

  it("successive deals return distinct cards", () => {
    const deck  = new Deck().shuffle();
    const card1 = deck.deal();
    const card2 = deck.deal();
    expect(card1.equals(card2)).toBe(false);
  });
});

// ─── deal(n) — multiple cards ─────────────────────────────────────────────────

describe("Deck — deal(n)", () => {
  it("returns exactly n cards", () => {
    expect(new Deck().deal(5)).toHaveLength(5);
  });

  it("reduces cardsRemaining by n", () => {
    const deck = new Deck();
    deck.deal(13);
    expect(deck.cardsRemaining).toBe(39);
  });

  it("deal(0) returns an empty array without throwing", () => {
    expect(new Deck().deal(0)).toEqual([]);
  });

  it("deal(52) returns all 52 cards", () => {
    const cards = new Deck().deal(52);
    expect(cards).toHaveLength(52);
  });

  it("throws when n exceeds cards remaining", () => {
    const deck = new Deck();
    deck.deal(50);
    expect(() => deck.deal(3)).toThrow(/Cannot deal 3 cards/);
  });

  it("throws for a negative count", () => {
    expect(() => new Deck().deal(-1)).toThrow(RangeError);
  });

  it("throws for a non-integer count", () => {
    expect(() => new Deck().deal(2.5)).toThrow(RangeError);
  });

  it("returned cards are Card instances", () => {
    const cards = new Deck().deal(3);
    cards.forEach((c) => expect(c).toBeInstanceOf(Card));
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe("Deck — reset()", () => {
  it("restores cardsRemaining to 52", () => {
    const deck = new Deck();
    deck.deal(30);
    deck.reset();
    expect(deck.cardsRemaining).toBe(52);
  });

  it("returns the same Deck instance (chainable)", () => {
    const deck = new Deck();
    expect(deck.reset()).toBe(deck);
  });

  it("restores original unshuffled order", () => {
    const deck     = new Deck();
    const original = deckSignature(deck);
    deck.shuffle().reset();
    expect(deckSignature(deck)).toBe(original);
  });

  it("can be called on an empty deck", () => {
    const deck = new Deck();
    deck.deal(52);
    expect(() => deck.reset()).not.toThrow();
    expect(deck.cardsRemaining).toBe(52);
  });
});

// ─── cardsRemaining & isEmpty ─────────────────────────────────────────────────

describe("Deck — cardsRemaining / isEmpty", () => {
  it("decrements with each deal", () => {
    const deck = new Deck();
    for (let i = 52; i > 0; i--) {
      expect(deck.cardsRemaining).toBe(i);
      deck.deal();
    }
  });

  it("isEmpty is false when cards remain", () => {
    expect(new Deck().isEmpty).toBe(false);
  });

  it("isEmpty is true after all cards are dealt", () => {
    const deck = new Deck();
    deck.deal(52);
    expect(deck.isEmpty).toBe(true);
  });
});

// ─── peek() ───────────────────────────────────────────────────────────────────

describe("Deck — peek()", () => {
  it("returns the top card without removing it", () => {
    const deck = new Deck();
    const top  = deck.peek();
    expect(deck.cardsRemaining).toBe(52);
    expect(top).toBeInstanceOf(Card);
  });

  it("peeked card matches the next deal()", () => {
    const deck    = new Deck().shuffle();
    const peeked  = deck.peek()!;
    const dealt   = deck.deal();
    expect(peeked.equals(dealt)).toBe(true);
  });

  it("returns undefined on an empty deck", () => {
    const deck = new Deck();
    deck.deal(52);
    expect(deck.peek()).toBeUndefined();
  });
});

// ─── Chaining ────────────────────────────────────────────────────────────────

describe("Deck — method chaining", () => {
  it("new Deck().shuffle().deal(5) works", () => {
    const hand = new Deck().shuffle().deal(5);
    expect(hand).toHaveLength(5);
  });

  it("deck.reset().shuffle().deal() works", () => {
    const deck = new Deck();
    deck.deal(52);
    expect(() => deck.reset().shuffle().deal()).not.toThrow();
  });
});

// ─── Specific card content ────────────────────────────────────────────────────

describe("Deck — card content", () => {
  it("contains exactly 4 aces", () => {
    const aces = new Deck().deal(52).filter((c) => c.rank === Rank.ACE);
    expect(aces).toHaveLength(4);
  });

  it("contains exactly 13 spades", () => {
    const spades = new Deck().deal(52).filter((c) => c.suit === Suit.SPADES);
    expect(spades).toHaveLength(13);
  });

  it("the Ace of Spades is present", () => {
    const aceOfSpades = new Card(Rank.ACE, Suit.SPADES);
    const found = new Deck().deal(52).some((c) => c.equals(aceOfSpades));
    expect(found).toBe(true);
  });
});
