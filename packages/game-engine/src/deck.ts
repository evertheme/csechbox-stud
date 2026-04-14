import type { Card, Rank, Suit } from "@csechbox/shared-types";

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = this.createDeck();
  }

  private createDeck(): Card[] {
    return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
  }

  shuffle(): this {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j]!, this.cards[i]!];
    }
    return this;
  }

  deal(count: number): Card[] {
    if (count > this.cards.length) {
      throw new Error(`Cannot deal ${count} cards; only ${this.cards.length} remain.`);
    }
    return this.cards.splice(0, count);
  }

  dealOne(): Card {
    const card = this.cards.shift();
    if (!card) throw new Error("Deck is empty.");
    return card;
  }

  get remaining(): number {
    return this.cards.length;
  }

  reset(): this {
    this.cards = this.createDeck();
    return this;
  }
}
