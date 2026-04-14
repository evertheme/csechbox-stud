import type {
  Card,
  GamePhase,
  BettingAction,
  Player,
  Pot,
} from "@csechbox/shared-types";
import { Deck } from "./deck.js";
import { HandEvaluator } from "./hand-evaluator.js";

export interface RoundOptions {
  smallBlind: number;
  bigBlind: number;
}

export interface RoundPlayer extends Player {
  holeCards: Card[];
}

export interface RoundResult {
  winners: { playerId: string; amount: number }[];
  playerHands: { playerId: string; description: string; score: number }[];
}

export class PokerRound {
  private deck: Deck;
  private evaluator: HandEvaluator;
  private players: RoundPlayer[];
  private communityCards: Card[] = [];
  private pots: Pot[] = [{ amount: 0, eligiblePlayerIds: [] }];
  private phase: GamePhase = "waiting";
  private currentPlayerIndex = 0;
  private dealerIndex: number;
  private options: RoundOptions;

  constructor(players: RoundPlayer[], dealerIndex: number, options: RoundOptions) {
    this.deck = new Deck();
    this.evaluator = new HandEvaluator();
    this.players = players;
    this.dealerIndex = dealerIndex;
    this.options = options;
  }

  start(): void {
    this.deck.reset().shuffle();
    this.phase = "pre-flop";
    this.dealHoleCards();
    this.postBlinds();
  }

  private dealHoleCards(): void {
    for (const player of this.players) {
      player.holeCards = this.deck.deal(2);
    }
  }

  private postBlinds(): void {
    const sbIndex = (this.dealerIndex + 1) % this.players.length;
    const bbIndex = (this.dealerIndex + 2) % this.players.length;
    this.applyBet(sbIndex, this.options.smallBlind);
    this.applyBet(bbIndex, this.options.bigBlind);
    this.currentPlayerIndex = (bbIndex + 1) % this.players.length;
  }

  private applyBet(playerIndex: number, amount: number): void {
    const player = this.players[playerIndex]!;
    const actual = Math.min(amount, player.chipCount);
    player.chipCount -= actual;
    player.currentBet += actual;
    player.totalBetInRound += actual;
    this.pots[0]!.amount += actual;
  }

  handleAction(playerId: string, action: BettingAction, amount = 0): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`Player ${playerId} not found.`);

    switch (action) {
      case "fold":
        player.status = "folded";
        break;
      case "check":
        break;
      case "call": {
        const maxBet = Math.max(...this.players.map((p) => p.currentBet));
        const toCall = maxBet - player.currentBet;
        this.applyBet(this.players.indexOf(player), toCall);
        break;
      }
      case "raise":
        this.applyBet(this.players.indexOf(player), amount);
        break;
      case "all-in":
        this.applyBet(this.players.indexOf(player), player.chipCount);
        player.status = "all-in";
        break;
    }

    this.advanceTurn();
  }

  dealFlop(): void {
    this.phase = "flop";
    this.communityCards.push(...this.deck.deal(3));
    this.resetBets();
  }

  dealTurn(): void {
    this.phase = "turn";
    this.communityCards.push(this.deck.dealOne());
    this.resetBets();
  }

  dealRiver(): void {
    this.phase = "river";
    this.communityCards.push(this.deck.dealOne());
    this.resetBets();
  }

  showdown(): RoundResult {
    this.phase = "showdown";
    const activePlayers = this.players.filter((p) => p.status !== "folded");
    const playerHands = activePlayers.map((p) => {
      const result = this.evaluator.evaluate(p.holeCards, this.communityCards);
      return { playerId: p.id, description: result.description, score: result.score };
    });

    playerHands.sort((a, b) => b.score - a.score);
    const topScore = playerHands[0]!.score;
    const winnerIds = playerHands.filter((h) => h.score === topScore).map((h) => h.playerId);
    const totalPot = this.pots.reduce((s, p) => s + p.amount, 0);
    const splitAmount = Math.floor(totalPot / winnerIds.length);

    const winners = winnerIds.map((id) => ({ playerId: id, amount: splitAmount }));
    for (const winner of winners) {
      const player = this.players.find((p) => p.id === winner.playerId)!;
      player.chipCount += winner.amount;
    }

    this.phase = "ended";
    return { winners, playerHands };
  }

  private resetBets(): void {
    for (const player of this.players) {
      player.currentBet = 0;
    }
    this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
  }

  private advanceTurn(): void {
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (
      this.players[this.currentPlayerIndex]!.status === "folded" ||
      this.players[this.currentPlayerIndex]!.status === "all-in"
    );
  }

  getPhase(): GamePhase { return this.phase; }
  getCommunityCards(): Card[] { return this.communityCards; }
  getPots(): Pot[] { return this.pots; }
  getPlayers(): RoundPlayer[] { return this.players; }
  getCurrentPlayer(): RoundPlayer { return this.players[this.currentPlayerIndex]!; }
}
