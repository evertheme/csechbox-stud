import { Deck } from "../deck.js";

describe("Deck", () => {
  it("creates a full 52-card deck", () => {
    const deck = new Deck();
    expect(deck.remaining).toBe(52);
  });

  it("deals cards reducing the count", () => {
    const deck = new Deck();
    const cards = deck.deal(5);
    expect(cards).toHaveLength(5);
    expect(deck.remaining).toBe(47);
  });

  it("throws when dealing more cards than available", () => {
    const deck = new Deck();
    expect(() => deck.deal(53)).toThrow();
  });

  it("shuffles the deck", () => {
    const deck1 = new Deck();
    const deck2 = new Deck().shuffle();
    const cards1 = deck1.deal(52);
    const cards2 = deck2.deal(52);
    // Very unlikely to be in the same order after shuffle
    const same = cards1.every((c, i) => c.rank === cards2[i]!.rank && c.suit === cards2[i]!.suit);
    expect(same).toBe(false);
  });

  it("resets to a full deck", () => {
    const deck = new Deck();
    deck.deal(10);
    deck.reset();
    expect(deck.remaining).toBe(52);
  });
});
