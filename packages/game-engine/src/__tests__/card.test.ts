import { Card, Rank, Suit } from "../card.js";

describe("Card", () => {
  describe("constructor & basic properties", () => {
    it("stores rank and suit", () => {
      const card = new Card(Rank.ACE, Suit.SPADES);
      expect(card.rank).toBe(Rank.ACE);
      expect(card.suit).toBe(Suit.SPADES);
    });

    it("is immutable (readonly fields)", () => {
      const card = new Card(Rank.KING, Suit.HEARTS);
      // TypeScript prevents assignment at compile time; the values should not change
      expect(card.rank).toBe(Rank.KING);
      expect(card.suit).toBe(Suit.HEARTS);
    });
  });

  describe("value", () => {
    it.each([
      [Rank.TWO,   2],
      [Rank.THREE, 3],
      [Rank.NINE,  9],
      [Rank.TEN,   10],
      [Rank.JACK,  11],
      [Rank.QUEEN, 12],
      [Rank.KING,  13],
      [Rank.ACE,   14],
    ])("Rank.%s has value %i", (rank, expected) => {
      expect(new Card(rank, Suit.CLUBS).value).toBe(expected);
    });
  });

  describe("symbol", () => {
    it.each([
      [Suit.SPADES,   "♠"],
      [Suit.HEARTS,   "♥"],
      [Suit.DIAMONDS, "♦"],
      [Suit.CLUBS,    "♣"],
    ])("Suit.%s maps to %s", (suit, expected) => {
      expect(new Card(Rank.ACE, suit).symbol).toBe(expected);
    });
  });

  describe("toString()", () => {
    it('returns "A♠" for Ace of Spades', () => {
      expect(new Card(Rank.ACE, Suit.SPADES).toString()).toBe("A♠");
    });

    it('returns "10♥" for Ten of Hearts', () => {
      expect(new Card(Rank.TEN, Suit.HEARTS).toString()).toBe("10♥");
    });

    it('returns "Q♦" for Queen of Diamonds', () => {
      expect(new Card(Rank.QUEEN, Suit.DIAMONDS).toString()).toBe("Q♦");
    });

    it('returns "2♣" for Two of Clubs', () => {
      expect(new Card(Rank.TWO, Suit.CLUBS).toString()).toBe("2♣");
    });
  });

  describe("equals()", () => {
    it("returns true for the same rank and suit", () => {
      const a = new Card(Rank.ACE, Suit.SPADES);
      const b = new Card(Rank.ACE, Suit.SPADES);
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when ranks differ", () => {
      const a = new Card(Rank.ACE, Suit.SPADES);
      const b = new Card(Rank.KING, Suit.SPADES);
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when suits differ", () => {
      const a = new Card(Rank.ACE, Suit.SPADES);
      const b = new Card(Rank.ACE, Suit.HEARTS);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("compareValue()", () => {
    it("returns positive when this card outranks the other", () => {
      const ace  = new Card(Rank.ACE,  Suit.SPADES);
      const king = new Card(Rank.KING, Suit.SPADES);
      expect(ace.compareValue(king)).toBeGreaterThan(0);
    });

    it("returns negative when this card is lower than the other", () => {
      const two = new Card(Rank.TWO, Suit.CLUBS);
      const ace = new Card(Rank.ACE, Suit.CLUBS);
      expect(two.compareValue(ace)).toBeLessThan(0);
    });

    it("returns zero for equal-ranked cards regardless of suit", () => {
      const aceSpades = new Card(Rank.ACE, Suit.SPADES);
      const aceHearts = new Card(Rank.ACE, Suit.HEARTS);
      expect(aceSpades.compareValue(aceHearts)).toBe(0);
    });
  });

  describe("toPlain() / fromPlain()", () => {
    it("round-trips through plain object form", () => {
      const original = new Card(Rank.JACK, Suit.DIAMONDS);
      const plain    = original.toPlain();
      const restored = Card.fromPlain(plain);

      expect(restored.equals(original)).toBe(true);
    });

    it("toPlain() returns a raw { rank, suit } object", () => {
      const card  = new Card(Rank.FIVE, Suit.CLUBS);
      const plain = card.toPlain();
      expect(plain).toEqual({ rank: "5", suit: "clubs" });
    });
  });

  describe("Card.fullDeck()", () => {
    it("produces exactly 52 cards", () => {
      expect(Card.fullDeck()).toHaveLength(52);
    });

    it("has no duplicates", () => {
      const deck  = Card.fullDeck();
      const keys  = new Set(deck.map((c) => c.toString()));
      expect(keys.size).toBe(52);
    });

    it("includes all four aces", () => {
      const aces = Card.fullDeck().filter((c) => c.rank === Rank.ACE);
      expect(aces).toHaveLength(4);
      expect(aces.map((c) => c.symbol).sort()).toEqual(["♠", "♥", "♦", "♣"].sort());
    });
  });
});
