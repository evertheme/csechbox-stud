import type { GameSettings, GameState, BettingAction } from "@csechbox/shared-types";
import { PokerRound, type RoundPlayer } from "./poker-round.js";

export class GameEngine {
  private settings: GameSettings;
  private players: RoundPlayer[] = [];
  private currentRound: PokerRound | null = null;
  private dealerIndex = 0;
  private roundNumber = 0;
  private gameId: string;

  constructor(gameId: string, settings: GameSettings) {
    this.gameId = gameId;
    this.settings = settings;
  }

  addPlayer(player: RoundPlayer): void {
    if (this.players.length >= this.settings.maxPlayers) {
      throw new Error("Game is full.");
    }
    this.players.push(player);
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((p) => p.id !== playerId);
  }

  startRound(): void {
    if (this.players.length < 2) {
      throw new Error("Need at least 2 players to start a round.");
    }
    this.roundNumber++;
    this.currentRound = new PokerRound(
      this.players.map((p) => ({ ...p, holeCards: [], currentBet: 0, totalBetInRound: 0 })),
      this.dealerIndex,
      { smallBlind: this.settings.smallBlind, bigBlind: this.settings.bigBlind },
    );
    this.currentRound.start();
  }

  handleAction(playerId: string, action: BettingAction, amount = 0): void {
    if (!this.currentRound) throw new Error("No active round.");
    this.currentRound.handleAction(playerId, action, amount);
  }

  advancePhase(): void {
    if (!this.currentRound) throw new Error("No active round.");
    const phase = this.currentRound.getPhase();
    switch (phase) {
      case "pre-flop": this.currentRound.dealFlop(); break;
      case "flop": this.currentRound.dealTurn(); break;
      case "turn": this.currentRound.dealRiver(); break;
      case "river":
        this.currentRound.showdown();
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
        break;
      default:
        throw new Error(`Cannot advance from phase: ${phase}`);
    }
  }

  getState(): GameState {
    const round = this.currentRound;
    return {
      id: this.gameId,
      phase: round?.getPhase() ?? "waiting",
      players: (round?.getPlayers() ?? this.players).map(({ holeCards: _hc, ...pub }) => ({
        ...pub,
        hasHoleCards: true,
      })),
      communityCards: round?.getCommunityCards() ?? [],
      pots: round?.getPots() ?? [],
      currentPlayerIndex: 0,
      dealerIndex: this.dealerIndex,
      settings: this.settings,
      roundNumber: this.roundNumber,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}
