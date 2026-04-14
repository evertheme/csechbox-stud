import { EventEmitter } from "events";
import {
  WinCondition,
  SpecialRuleType,
  type GameRules,
  type StreetName,
} from "@poker/shared-types";
import { Card } from "./card.js";
import { Deck } from "./deck.js";
import { HandEvaluator, type HandRank } from "./hand-evaluator.js";
import { LowHandEvaluator, LowHandType, type LowHandRank } from "./low-hand-evaluator.js";

// ─── Phase ────────────────────────────────────────────────────────────────────

/**
 * Ordered lifecycle phases for a single hand of poker.
 *
 * ```
 * waiting → ante → dealing → betting ⟷ street-complete → showdown → complete
 * ```
 *
 * The cycle `dealing → betting → street-complete` repeats once per street.
 * After the last street the engine transitions directly to `showdown`.
 */
export type GamePhase =
  | "waiting"         // engine constructed, not yet started
  | "ante"            // antes being collected (internal transition; not usually observed)
  | "dealing"         // waiting for dealCards() to be called
  | "betting"         // players taking bet / call / raise / fold / check actions
  | "street-complete" // betting round ended; call nextStreet() or determineWinner()
  | "showdown"        // evaluating hands
  | "complete";       // game over; chips have been awarded

// ─── Public state types ───────────────────────────────────────────────────────

/**
 * A single card held by a player, with face-up/down visibility metadata.
 *
 * In stud games, face-down cards are private (hole cards); face-up cards are
 * visible to all players at the table.
 */
export interface CardSlot {
  /** The card itself. */
  card: Card;
  /** `true` → visible to all players; `false` → private to the holder. */
  faceUp: boolean;
}

/** Public snapshot of a single player's state, as seen by the game controller. */
export interface PlayerState {
  id: string;
  /** All cards held, including hole cards. */
  cards: CardSlot[];
  /** Current chip stack. */
  chips: number;
  /** Amount committed to the pot in the current street only. Resets each street. */
  bet: number;
  /** Total chips committed to the pot this entire hand. Used for side-pot maths. */
  totalBet: number;
  folded: boolean;
  allIn: boolean;
}

/**
 * A pot slice — either the main pot or one of the side pots created by an
 * all-in.  Only players in `eligiblePlayerIds` can win this slice.
 */
export interface PotEntry {
  amount: number;
  eligiblePlayerIds: string[];
}

/**
 * Full game state, as seen by a server or game-controller process.
 * **Every card — including hole cards — is included in `players[].cards`.**
 * Never send this object directly to a client; use {@link PlayerViewState} instead.
 */
export interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  /** Main pot and any side pots, calculated from player contributions. */
  pots: PotEntry[];
  /** Convenience total: sum of all `pots[].amount` values. */
  pot: number;
  /** Highest bet that has been placed in the current betting round. */
  currentBet: number;
  /** Index into `players` of the player whose turn it is to act. */
  activePlayerIndex: number;
  /** ID of the active player (`null` when no one is to act). */
  activePlayerId: string | null;
  /** Identifier of the street currently being dealt / bet. */
  currentStreet: StreetName | null;
  /** Zero-based index into `rules.bettingRounds`. */
  streetIndex: number;
  /** Live `Deck` instance — inspect or seed for deterministic tests. */
  deck: Deck;
  /** The immutable game-rules configuration driving this engine. */
  rules: Readonly<GameRules>;
}

/**
 * Game state from one player's perspective.
 * The requesting player sees all their own cards; opponents' face-down cards
 * are omitted.  Safe to send to a specific client over the wire.
 */
export interface PlayerViewState {
  phase: GamePhase;
  /** All of this player's cards (hole cards + face-up cards). */
  ownCards: CardSlot[];
  opponents: Array<{
    id: string;
    /** Only face-up cards are visible; face-down cards are never exposed. */
    visibleCards: CardSlot[];
    chips: number;
    /** Amount this opponent has bet in the current street. */
    bet: number;
    folded: boolean;
    allIn: boolean;
  }>;
  pots: PotEntry[];
  pot: number;
  currentBet: number;
  /** `true` when it is this player's turn to act. */
  isYourTurn: boolean;
  currentStreet: StreetName | null;
}

/** A single entry in a showdown result, describing one player's winnings. */
export interface WinnerEntry {
  playerId: string;
  /** Total chips awarded from all pots this player won. */
  amount: number;
  /** The evaluated hand that won (undefined if the player won by default). */
  hand?: HandRank | LowHandRank;
  /** `true` when this player won the high half of a hi-lo split pot. */
  isHighWinner?: boolean;
  /** `true` when this player won the low half of a hi-lo split pot. */
  isLowWinner?: boolean;
}

/** Complete result of a showdown, including all hand evaluations. */
export interface ShowdownResult {
  /** Consolidated list of all winners (a player may appear once even if they won multiple pots). */
  winners: WinnerEntry[];
  playerHands: Array<{
    playerId: string;
    /** Best high hand (present when game uses a high evaluator). */
    highHand?: HandRank;
    /** Best low hand (present when game uses a low or razz evaluator). */
    lowHand?: LowHandRank;
    /** Whether the low hand qualifies for the low half in a hi-lo game. */
    lowQualifies?: boolean;
  }>;
}

/** Optional settings passed to the {@link GameEngine} constructor. */
export interface GameEngineOptions {
  /**
   * Starting chip count for every player.
   * @default 1000
   */
  startingChips?: number;
  /**
   * Ante amount collected from each player at the start of the hand.
   * Only applied when `rules.anteRequired` is `true`.
   * @default 10
   */
  anteAmount?: number;
}

// ─── Internal player record ───────────────────────────────────────────────────

interface InternalPlayer {
  id: string;
  cards: CardSlot[];
  chips: number;
  /** Chips bet in the current street (resets each street). */
  streetBet: number;
  /** Chips committed to the pot across the whole hand (for side-pot maths). */
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  /**
   * Set to `true` once the player has acted in the current betting round.
   * Cleared for all players (except the aggressor) whenever a bet or raise
   * raises the current-bet level.
   */
  hasActedThisRound: boolean;
}

// ─── Typed event declarations (declaration merging) ───────────────────────────

/** Strongly-typed event surface for {@link GameEngine}. */
export declare interface GameEngine {
  // on overloads
  on(
    event: "game-started",
    listener: (state: GameState) => void,
  ): this;
  on(
    event: "cards-dealt",
    listener: (
      street: StreetName,
      playerCards: Array<{ playerId: string; cards: CardSlot[] }>,
    ) => void,
  ): this;
  on(
    event: "player-action",
    listener: (
      playerId: string,
      action: "bet" | "call" | "raise" | "fold" | "check",
      amount: number,
      state: GameState,
    ) => void,
  ): this;
  on(event: "street-complete", listener: (street: StreetName) => void): this;
  on(event: "showdown", listener: (result: ShowdownResult) => void): this;
  on(
    event: "game-complete",
    listener: (result: ShowdownResult, state: GameState) => void,
  ): this;

  // emit overloads
  emit(event: "game-started", state: GameState): boolean;
  emit(
    event: "cards-dealt",
    street: StreetName,
    playerCards: Array<{ playerId: string; cards: CardSlot[] }>,
  ): boolean;
  emit(
    event: "player-action",
    playerId: string,
    action: string,
    amount: number,
    state: GameState,
  ): boolean;
  emit(event: "street-complete", street: StreetName): boolean;
  emit(event: "showdown", result: ShowdownResult): boolean;
  emit(event: "game-complete", result: ShowdownResult, state: GameState): boolean;
}

// ─── GameEngine ────────────────────────────────────────────────────────────────

/**
 * Drives a complete hand of stud poker according to a {@link GameRules}
 * configuration.  Works with any variant defined in `@poker/shared-types`:
 * Five-Card Stud, Seven-Card Stud, Razz, Hi-Lo, and custom variants.
 *
 * ## Lifecycle
 * ```typescript
 * const engine = new GameEngine(sevenCardStudRules, ["alice", "bob", "carol"]);
 *
 * engine.on("game-started", (state) => console.log("started", state));
 * engine.on("cards-dealt",  (street, cards) => console.log("dealt", street));
 * engine.on("game-complete",(result) => console.log("winner", result.winners));
 *
 * engine.start();         // phase → "dealing"  (antes collected, deck shuffled)
 * engine.dealCards();     // phase → "betting"  (third-street cards dealt)
 *
 * engine.bet("alice", 20);
 * engine.call("bob");
 * engine.fold("carol");
 * // ... phase auto-transitions to "street-complete" when betting ends
 *
 * engine.nextStreet();    // phase → "dealing"  (advance to fourth-street)
 * engine.dealCards();     // phase → "betting"
 * // ... continue until all streets are done, then determineWinner() is called
 * //     automatically by nextStreet() on the final street.
 * ```
 *
 * ## Side pots
 * When a player goes all-in, the engine automatically splits the pot into
 * main and side pots.  Each slice is awarded independently at showdown.
 *
 * ## Hi-Lo split
 * For games with `winCondition === HIGH_LOW_SPLIT`, the pot is split between
 * the best high hand and the best qualifying low hand.  The eight-or-better
 * qualifier (if present in `specialRules`) restricts low eligibility.
 *
 * ## Determinism / testing
 * `deck` is exposed on the instance.  Call `deck.reset()` followed by a
 * custom shuffle before `start()` to reproduce specific card distributions.
 */
export class GameEngine extends EventEmitter {
  private readonly rules: Readonly<GameRules>;
  private readonly players: InternalPlayer[];

  /** Live deck instance — exposed for inspection and deterministic testing. */
  readonly deck: Deck;

  private phase: GamePhase = "waiting";
  private currentStreetIdx = -1;
  private currentBet = 0;
  private activePlayerIdx = 0;

  private readonly highEvaluator = new HandEvaluator();
  private readonly lowEvaluator  = new LowHandEvaluator();
  private readonly anteAmount: number;

  // ── Constructor ─────────────────────────────────────────────────────────────

  /**
   * @param rules      Complete game-rule configuration.
   * @param playerIds  Ordered array of player identifiers (2–8 players).
   * @param options    Optional chip and ante amounts.
   *
   * @throws {Error} when `playerIds` has fewer than 2 entries or contains
   *                 duplicates.
   */
  constructor(
    rules: GameRules,
    playerIds: string[],
    options: GameEngineOptions = {},
  ) {
    super();

    if (playerIds.length < 2) {
      throw new Error("A game requires at least 2 players.");
    }
    if (new Set(playerIds).size !== playerIds.length) {
      throw new Error("Player IDs must be unique.");
    }

    const startingChips = options.startingChips ?? 1000;
    this.anteAmount = options.anteAmount ?? 10;
    this.rules = Object.freeze({ ...rules });
    this.deck  = new Deck();

    this.players = playerIds.map((id) => ({
      id,
      cards: [],
      chips: startingChips,
      streetBet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      hasActedThisRound: false,
    }));
  }

  // ── Game lifecycle ──────────────────────────────────────────────────────────

  /**
   * Shuffle the deck, collect antes (if `rules.anteRequired`), and position
   * the engine at the first street.
   *
   * After this call, invoke {@link dealCards} to begin the first dealing phase.
   * Emits `"game-started"`.
   *
   * @throws if the game has already been started.
   */
  start(): void {
    this.requirePhase("waiting");

    this.deck.reset().shuffle();
    this.phase = "ante";

    if (this.rules.anteRequired) {
      for (const player of this.players) {
        const actual = Math.min(this.anteAmount, player.chips);
        player.chips    -= actual;
        player.totalBet += actual;
        if (player.chips === 0) player.allIn = true;
      }
    }

    this.currentStreetIdx = 0;
    this.phase = "dealing";
    this.emit("game-started", this.getGameState());
  }

  /**
   * Deal cards to every active (non-folded) player for the current street,
   * following all matching {@link GameRules.dealingPattern} entries.
   *
   * Pattern entries are processed in array order.  For each entry, `cards`
   * cards are dealt to every active player before the next entry begins —
   * preserving the round-by-round dealing order of real stud.
   *
   * After dealing, `phase` advances to `"betting"` and the first player to
   * act is determined (bring-in logic applied on the first street).
   * Emits `"cards-dealt"`.
   *
   * @throws if `phase !== "dealing"`.
   * @throws if no dealing patterns exist for the current street.
   */
  dealCards(): void {
    this.requirePhase("dealing");

    const street = this.currentStreet;
    if (street === null) throw new Error("No current street.");

    const patterns = this.rules.dealingPattern.filter((p) => p.street === street);
    if (patterns.length === 0) {
      throw new Error(`No dealing patterns found for street "${street}".`);
    }

    const activePlayers = this.players.filter((p) => !p.folded);
    const dealtInfo = activePlayers.map((p) => ({
      playerId: p.id,
      cards: [] as CardSlot[],
    }));

    for (const pattern of patterns) {
      for (let i = 0; i < activePlayers.length; i++) {
        const player = activePlayers[i]!;
        for (let c = 0; c < pattern.cards; c++) {
          const slot: CardSlot = { card: this.deck.deal(), faceUp: pattern.faceUp };
          player.cards.push(slot);
          dealtInfo[i]!.cards.push(slot);
        }
      }
    }

    this.phase = "betting";
    this.initBettingRound();
    this.emit("cards-dealt", street, dealtInfo);
  }

  /**
   * Active player opens the betting round with `amount`.
   * Only valid when `currentBet === 0` (no bet has been placed yet this round).
   *
   * @param playerId - Must be the current active player.
   * @param amount   - Opening bet (must be > 0 and ≤ player's chip stack).
   *
   * @throws if it is not this player's turn, or if validation fails.
   */
  bet(playerId: string, amount: number): void {
    const player = this.requireAction(playerId);

    if (this.currentBet > 0) {
      throw new Error(
        `There is already a bet of ${this.currentBet}. ` +
        `Use call(), raise(), or fold().`,
      );
    }
    if (amount <= 0) {
      throw new Error("Bet amount must be positive.");
    }
    if (amount > player.chips) {
      throw new Error(
        `Player "${playerId}" has ${player.chips} chips but tried to bet ${amount}.`,
      );
    }

    this.applyBet(player, amount);
    this.currentBet = player.streetBet;
    this.reopenAction(this.activePlayerIdx);
    player.hasActedThisRound = true;

    this.emit("player-action", playerId, "bet", amount, this.getGameState());
    this.advanceTurn();
  }

  /**
   * Active player calls the current bet.
   * If the player cannot cover the full amount they go all-in for their
   * remaining chips (partial call / short-call).
   *
   * @param playerId - Must be the current active player.
   *
   * @throws if there is nothing to call (`currentBet === 0`).
   */
  call(playerId: string): void {
    const player = this.requireAction(playerId);

    if (this.currentBet === 0) {
      throw new Error("No bet to call. Use check() or bet().");
    }

    const toCall = Math.min(this.currentBet - player.streetBet, player.chips);
    this.applyBet(player, toCall);
    player.hasActedThisRound = true;

    this.emit("player-action", playerId, "call", toCall, this.getGameState());
    this.advanceTurn();
  }

  /**
   * Active player raises the bet to `totalAmount`.
   *
   * `totalAmount` is the new **total** street-bet all players must now match
   * (not just the incremental raise amount).  For example, if `currentBet`
   * is 20 and you want to raise by 20, pass `totalAmount = 40`.
   *
   * @param playerId    - Must be the current active player.
   * @param totalAmount - New total street bet (must exceed `currentBet`).
   *
   * @throws if `totalAmount ≤ currentBet` or the player lacks sufficient chips.
   */
  raise(playerId: string, totalAmount: number): void {
    const player = this.requireAction(playerId);

    if (totalAmount <= this.currentBet) {
      throw new Error(
        `Raise amount ${totalAmount} must exceed the current bet of ${this.currentBet}.`,
      );
    }
    const additional = totalAmount - player.streetBet;
    if (additional > player.chips) {
      throw new Error(
        `Player "${playerId}" has ${player.chips} chips but needs ` +
        `${additional} more to raise to ${totalAmount}.`,
      );
    }

    this.applyBet(player, additional);
    this.currentBet = totalAmount;
    this.reopenAction(this.activePlayerIdx);
    player.hasActedThisRound = true;

    this.emit("player-action", playerId, "raise", totalAmount, this.getGameState());
    this.advanceTurn();
  }

  /**
   * Active player folds their hand, surrendering any chips already in the pot.
   *
   * @param playerId - Must be the current active player.
   */
  fold(playerId: string): void {
    const player = this.requireAction(playerId);
    player.folded = true;
    player.hasActedThisRound = true;

    this.emit("player-action", playerId, "fold", 0, this.getGameState());
    this.advanceTurn();
  }

  /**
   * Active player checks (passes without placing a bet).
   * Valid only when the player has already matched `currentBet`
   * (i.e., `currentBet === 0` or `player.streetBet === currentBet`).
   *
   * @param playerId - Must be the current active player.
   *
   * @throws if there is an outstanding bet the player has not yet called.
   */
  check(playerId: string): void {
    const player = this.requireAction(playerId);

    if (player.streetBet < this.currentBet) {
      throw new Error(
        `Cannot check — the current bet is ${this.currentBet}. ` +
        `Use call(), raise(), or fold().`,
      );
    }

    player.hasActedThisRound = true;
    this.emit("player-action", playerId, "check", 0, this.getGameState());
    this.advanceTurn();
  }

  /**
   * Advance to the next street after a betting round ends
   * (`phase === "street-complete"`).
   *
   * If there are more streets remaining, `phase` transitions to `"dealing"`
   * and {@link dealCards} should be called next.
   *
   * If this was the **last** street, {@link determineWinner} is called
   * automatically and `phase` advances to `"complete"`.
   *
   * @throws if `phase !== "street-complete"`.
   */
  nextStreet(): void {
    this.requirePhase("street-complete");

    this.currentStreetIdx++;

    if (this.currentStreetIdx >= this.rules.bettingRounds.length) {
      this.determineWinner();
      return;
    }

    this.phase = "dealing";
  }

  /**
   * Evaluate all active hands, calculate side pots, and award chips.
   *
   * Normally triggered automatically by {@link nextStreet} after the last
   * street, but can be called directly when only one active player remains
   * (all others folded) or as part of custom game logic.
   *
   * Emits `"showdown"` then `"game-complete"`.
   *
   * @returns A {@link ShowdownResult} describing every winner and their hand.
   */
  determineWinner(): ShowdownResult {
    this.phase = "showdown";

    const active = this.players.filter((p) => !p.folded);
    const result = this.resolveShowdown(active);

    this.awardPots(result.winners);
    this.phase = "complete";

    this.emit("showdown", result);
    this.emit("game-complete", result, this.getGameState());

    return result;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /**
   * Full game state for a server or game-controller process.
   * All cards — including face-down hole cards — are present in
   * `players[].cards`.  **Do not send this to clients.**
   */
  getGameState(): GameState {
    const totalPot = this.players.reduce((s, p) => s + p.totalBet, 0);

    return {
      phase: this.phase,
      players: this.players.map((p) => ({
        id:       p.id,
        cards:    [...p.cards],
        chips:    p.chips,
        bet:      p.streetBet,
        totalBet: p.totalBet,
        folded:   p.folded,
        allIn:    p.allIn,
      })),
      pots:               this.calculateSidePots(),
      pot:                totalPot,
      currentBet:         this.currentBet,
      activePlayerIndex:  this.activePlayerIdx,
      activePlayerId:     this.players[this.activePlayerIdx]?.id ?? null,
      currentStreet:      this.currentStreet,
      streetIndex:        this.currentStreetIdx,
      deck:               this.deck,
      rules:              this.rules,
    };
  }

  /**
   * Game state as seen by a specific player.
   *
   * The requesting player receives all their own cards (including hole cards).
   * Each opponent only exposes their face-up cards — face-down cards are
   * omitted entirely, preserving game integrity.
   *
   * @param playerId - The player requesting their personalised view.
   * @throws if `playerId` is not registered in this game.
   */
  getPlayerState(playerId: string): PlayerViewState {
    const me = this.findPlayer(playerId);
    const totalPot = this.players.reduce((s, p) => s + p.totalBet, 0);

    return {
      phase:       this.phase,
      ownCards:    [...me.cards],
      opponents:   this.players
        .filter((p) => p.id !== playerId)
        .map((p) => ({
          id:           p.id,
          visibleCards: p.cards.filter((slot) => slot.faceUp),
          chips:        p.chips,
          bet:          p.streetBet,
          folded:       p.folded,
          allIn:        p.allIn,
        })),
      pots:        this.calculateSidePots(),
      pot:         totalPot,
      currentBet:  this.currentBet,
      isYourTurn:  this.players[this.activePlayerIdx]?.id === playerId,
      currentStreet: this.currentStreet,
    };
  }

  // ── Private: accessors ──────────────────────────────────────────────────────

  private get currentStreet(): StreetName | null {
    const round = this.rules.bettingRounds[this.currentStreetIdx];
    return round?.afterStreet ?? null;
  }

  private findPlayer(id: string): InternalPlayer {
    const p = this.players.find((p) => p.id === id);
    if (!p) throw new Error(`Player "${id}" not found.`);
    return p;
  }

  private requirePhase(expected: GamePhase): void {
    if (this.phase !== expected) {
      throw new Error(
        `Expected phase "${expected}", but current phase is "${this.phase}".`,
      );
    }
  }

  /**
   * Validates that it is the given player's turn and returns their record.
   * Throws a descriptive error on any validation failure.
   */
  private requireAction(playerId: string): InternalPlayer {
    this.requirePhase("betting");

    const player = this.findPlayer(playerId);
    const active = this.players[this.activePlayerIdx];

    if (!active || active.id !== playerId) {
      throw new Error(`It is not player "${playerId}"'s turn to act.`);
    }
    if (player.folded) {
      throw new Error(`Player "${playerId}" has already folded.`);
    }
    if (player.allIn) {
      throw new Error(`Player "${playerId}" is all-in and cannot act.`);
    }

    return player;
  }

  // ── Private: betting mechanics ──────────────────────────────────────────────

  /** Deduct `amount` from a player's stack and add it to their bet totals. */
  private applyBet(player: InternalPlayer, amount: number): void {
    const actual = Math.min(amount, player.chips);
    player.chips     -= actual;
    player.streetBet += actual;
    player.totalBet  += actual;
    if (player.chips === 0) player.allIn = true;
  }

  /**
   * Reset per-street bet counters and `hasActedThisRound` flags, then place
   * the active player at the correct position for the new betting round.
   *
   * For the **first** street with a bring-in, {@link findBringInPlayer} is
   * used to find the forced-opener.  All other streets start from the first
   * active player (index 0 direction).
   */
  private initBettingRound(): void {
    this.currentBet = 0;

    for (const player of this.players) {
      player.streetBet = 0;
      player.hasActedThisRound = false;
    }

    const bettingRound = this.rules.bettingRounds[this.currentStreetIdx];
    this.activePlayerIdx =
      bettingRound?.bringIn && this.currentStreetIdx === 0
        ? this.findBringInPlayer()
        : this.nextActiveFrom(-1);
  }

  /**
   * After a bet or raise: clear `hasActedThisRound` for every player except
   * the aggressor, forcing them to act again against the new price.
   */
  private reopenAction(aggressorIdx: number): void {
    for (let i = 0; i < this.players.length; i++) {
      if (i !== aggressorIdx) {
        const p = this.players[i]!;
        if (!p.folded && !p.allIn) p.hasActedThisRound = false;
      }
    }
  }

  /**
   * After each player action: determine whether the betting round is over and
   * either end it or advance the `activePlayerIdx` to the next player who
   * still needs to act.
   */
  private advanceTurn(): void {
    const nonFolded = this.players.filter((p) => !p.folded);

    // Single player remaining — pot goes to the survivor without showdown
    if (nonFolded.length === 1) {
      this.endBettingRound();
      return;
    }

    // All active players have acted and matched the current bet
    if (this.isBettingComplete()) {
      this.endBettingRound();
      return;
    }

    // Find the next player who still needs to act
    let idx = (this.activePlayerIdx + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[idx]!;
      const needsToAct =
        !p.folded &&
        !p.allIn &&
        (!p.hasActedThisRound || p.streetBet < this.currentBet);
      if (needsToAct) break;
      idx = (idx + 1) % this.players.length;
    }

    this.activePlayerIdx = idx;
  }

  /**
   * `true` when every active (non-folded, non-all-in) player has acted and
   * their street bet equals (or exceeds) the current bet.
   *
   * When all remaining players are all-in, `canAct` is empty and `every()`
   * returns `true`, correctly triggering end of the round.
   */
  private isBettingComplete(): boolean {
    const canAct = this.players.filter((p) => !p.folded && !p.allIn);
    return canAct.every(
      (p) => p.hasActedThisRound && p.streetBet >= this.currentBet,
    );
  }

  /**
   * Transition to `"street-complete"`, emit the event, and — when only one
   * player remains active — short-circuit directly to the showdown.
   */
  private endBettingRound(): void {
    const street = this.currentStreet!;
    this.phase = "street-complete";
    this.emit("street-complete", street);

    // All but one player folded — skip remaining streets
    const active = this.players.filter((p) => !p.folded);
    if (active.length === 1) {
      this.determineWinner();
    }
  }

  /**
   * Find the index of the player who must post the bring-in for the first
   * betting round.
   *
   * - **High games** (standard stud): player with the **lowest** face-up card.
   * - **Low games** (Razz / low stud): player with the **highest** face-up card.
   *
   * Tie-breaking by suit (standard casino convention) is not implemented;
   * ties are broken by player order instead.  Returns the first active player
   * when no face-up cards are present.
   */
  private findBringInPlayer(): number {
    const isLow =
      this.rules.handEvaluator === "razz" ||
      this.rules.handEvaluator === "low";

    let targetIdx   = this.nextActiveFrom(-1);
    let targetValue = isLow ? -Infinity : Infinity;

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!;
      if (p.folded || p.allIn) continue;

      const upCards = p.cards.filter((s) => s.faceUp);
      if (upCards.length === 0) continue;

      // Use the highest face-up card value as the comparison point
      const hi = Math.max(...upCards.map((s) => s.card.value));

      if (isLow ? hi > targetValue : hi < targetValue) {
        targetValue = hi;
        targetIdx   = i;
      }
    }

    return targetIdx;
  }

  /** Return the index of the first non-folded, non-all-in player after `from`. */
  private nextActiveFrom(from: number): number {
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (from + i) % this.players.length;
      const p   = this.players[idx]!;
      if (!p.folded && !p.allIn) return idx;
    }
    return 0; // fallback (all folded / all-in — shouldn't occur during betting)
  }

  // ── Private: side-pot calculation ───────────────────────────────────────────

  /**
   * Compute main and side pots from every player's `totalBet`.
   *
   * ## Algorithm
   * 1. Collect all unique non-zero bet levels, sorted ascending.
   * 2. For each level L: create a pot slice worth `(L − prevL) × contributors`,
   *    where `contributors` is everyone who has put in at least L chips.
   * 3. `eligiblePlayerIds` for each slice = non-folded contributors, since
   *    folded players have forfeited their right to win.
   *
   * @example
   * // Alice: 100, Bob: 50 (all-in), Carol: 100
   * // → main pot  (0–50):  50 × 3 = 150, eligible [Alice, Bob, Carol]
   * // → side pot (50–100): 50 × 2 = 100, eligible [Alice, Carol]
   */
  private calculateSidePots(): PotEntry[] {
    const contributions = this.players.map((p) => ({
      id:     p.id,
      total:  p.totalBet,
      folded: p.folded,
    }));

    const levels = [
      ...new Set(contributions.map((c) => c.total).filter((v) => v > 0)),
    ].sort((a, b) => a - b);

    if (levels.length === 0) {
      return [{ amount: 0, eligiblePlayerIds: [] }];
    }

    const pots: PotEntry[] = [];
    let prevLevel = 0;

    for (const level of levels) {
      const delta      = level - prevLevel;
      const inThisPot  = contributions.filter((c) => c.total >= level);
      const eligible   = inThisPot.filter((c) => !c.folded).map((c) => c.id);

      if (delta > 0 && inThisPot.length > 0) {
        pots.push({ amount: delta * inThisPot.length, eligiblePlayerIds: eligible });
      }
      prevLevel = level;
    }

    return pots;
  }

  // ── Private: showdown ───────────────────────────────────────────────────────

  /**
   * Evaluate all active players' hands and resolve every pot entry.
   *
   * - **High games**: only `HandEvaluator` is run.
   * - **Low / Razz games**: only `LowHandEvaluator` is run.
   * - **Hi-Lo split games**: both evaluators run for every player; the
   *   eight-or-better qualifier (if present in `specialRules`) gates low
   *   eligibility.
   *
   * Players with fewer than 5 cards are excluded from hand evaluation (they
   * can still win by default if all others fold).
   */
  private resolveShowdown(active: InternalPlayer[]): ShowdownResult {
    const hasEightOrBetter =
      this.rules.specialRules?.some(
        (r) => r.type === SpecialRuleType.EIGHT_OR_BETTER,
      ) ?? false;

    const needsHigh =
      this.rules.handEvaluator === "high" ||
      this.rules.winCondition  === WinCondition.HIGH_LOW_SPLIT;

    const needsLow =
      this.rules.handEvaluator === "low"  ||
      this.rules.handEvaluator === "razz" ||
      this.rules.winCondition  === WinCondition.HIGH_LOW_SPLIT;

    const playerHands = active
      .filter((p) => p.cards.length >= 5)
      .map((p) => {
        const cards = p.cards.map((s) => s.card);

        const highHand    = needsHigh ? this.highEvaluator.evaluate(cards) : undefined;
        const lowHand     = needsLow  ? this.lowEvaluator.evaluate(cards)  : undefined;
        const lowQualifies = lowHand
          ? this.lowQualifies(lowHand, hasEightOrBetter)
          : false;

        // exactOptionalPropertyTypes: omit the key entirely when the value
        // is undefined, rather than setting it to undefined.
        return {
          playerId: p.id,
          ...(highHand !== undefined ? { highHand } : {}),
          ...(lowHand  !== undefined ? { lowHand  } : {}),
          lowQualifies,
        };
      });

    const pots        = this.calculateSidePots();
    const allWinners: WinnerEntry[] = [];

    for (const pot of pots) {
      const eligible = playerHands.filter((h) =>
        pot.eligiblePlayerIds.includes(h.playerId),
      );
      allWinners.push(...this.resolvePot(pot, eligible));
    }

    // If a player won by others folding they may not have a hand entry yet
    if (active.length === 1 && allWinners.length === 0) {
      const totalPot = this.players.reduce((s, p) => s + p.totalBet, 0);
      allWinners.push({ playerId: active[0]!.id, amount: totalPot });
    }

    return {
      winners:     this.consolidateWinners(allWinners),
      playerHands,
    };
  }

  /**
   * Returns `true` when `hand` qualifies for the low half of a hi-lo pot.
   *
   * A hand qualifies when:
   * - Its type is `NO_PAIR` (any paired hand is automatically disqualified).
   * - If `eightOrBetter` is `true`, every card has an Ace-to-Five low value ≤ 8.
   */
  private lowQualifies(hand: LowHandRank, eightOrBetter: boolean): boolean {
    if (hand.type !== LowHandType.NO_PAIR) return false;
    if (!eightOrBetter) return true;

    // cards are sorted ascending by low value (Ace first); the last card is
    // the "worst" (highest) card in the hand.
    const highest = hand.cards[hand.cards.length - 1];
    if (!highest) return false;

    // Ace-to-Five low value: Ace = 1, all others = pip value
    const lv = highest.rank === "A" ? 1 : highest.value;
    return lv <= 8;
  }

  /**
   * Resolve a single pot entry, dispatching to the appropriate win-condition
   * resolver.
   */
  private resolvePot(
    pot: PotEntry,
    eligible: Array<{
      playerId: string;
      highHand?: HandRank;
      lowHand?: LowHandRank;
      lowQualifies?: boolean;
    }>,
  ): WinnerEntry[] {
    if (eligible.length === 0) return [];

    if (this.rules.winCondition === WinCondition.HIGH_LOW_SPLIT) {
      return this.resolveHighLow(pot, eligible);
    }

    const isLow = this.rules.winCondition === WinCondition.LOWEST_HAND;

    const scored = eligible
      .map((h) => ({
        playerId: h.playerId,
        score:    isLow ? (h.lowHand?.value ?? 0) : (h.highHand?.value ?? 0),
        hand:     isLow ? h.lowHand               : h.highHand,
      }))
      .filter((s) => s.score > 0);

    if (scored.length === 0) return [];

    const best    = Math.max(...scored.map((s) => s.score));
    const winners = scored.filter((s) => s.score === best);
    const share   = Math.floor(pot.amount / winners.length);

    return winners.map((w) => ({
      playerId:     w.playerId,
      amount:       share,
      // hand is absent when a player wins by default (all others folded).
      ...(w.hand !== undefined ? { hand: w.hand } : {}),
      isHighWinner: !isLow,
      isLowWinner:  isLow,
    }));
  }

  /**
   * Resolve a hi-lo split pot.
   *
   * - High half (floor(pot/2)) goes to the player with the best high hand.
   * - Low half goes to the player with the best **qualifying** low hand.
   * - If no low hand qualifies, the high-hand winner scoops the **whole** pot.
   * - Ties on either side are split evenly (integer chips; remainder is lost).
   *
   * A single player who wins both halves ("scoops") receives the full pot.
   */
  private resolveHighLow(
    pot: PotEntry,
    eligible: Array<{
      playerId: string;
      highHand?: HandRank;
      lowHand?: LowHandRank;
      lowQualifies?: boolean;
    }>,
  ): WinnerEntry[] {
    const highScored = eligible
      .filter((h) => h.highHand)
      .map((h) => ({ playerId: h.playerId, score: h.highHand!.value, hand: h.highHand! }));

    const lowScored = eligible
      .filter((h) => h.lowQualifies && h.lowHand)
      .map((h) => ({ playerId: h.playerId, score: h.lowHand!.value, hand: h.lowHand! }));

    if (highScored.length === 0) return [];

    const bestHigh   = Math.max(...highScored.map((s) => s.score));
    const highWinners = highScored.filter((s) => s.score === bestHigh);

    // No qualifying low hand → high scoops the whole pot
    if (lowScored.length === 0) {
      const share = Math.floor(pot.amount / highWinners.length);
      return highWinners.map((w) => ({
        playerId:     w.playerId,
        amount:       share,
        hand:         w.hand,
        isHighWinner: true,
      }));
    }

    const halfPot    = Math.floor(pot.amount / 2);
    const bestLow    = Math.max(...lowScored.map((s) => s.score));
    const lowWinners = lowScored.filter((s) => s.score === bestLow);
    const highShare  = Math.floor(halfPot / highWinners.length);
    const lowShare   = Math.floor(halfPot / lowWinners.length);

    const winners: WinnerEntry[] = [];
    for (const w of highWinners) {
      winners.push({ playerId: w.playerId, amount: highShare, hand: w.hand, isHighWinner: true });
    }
    for (const w of lowWinners) {
      winners.push({ playerId: w.playerId, amount: lowShare, hand: w.hand, isLowWinner: true });
    }
    return winners;
  }

  /**
   * Merge duplicate player entries so each player appears at most once in the
   * final winners list (a player can win both halves of a hi-lo pot and/or
   * multiple side pots in the same hand).
   */
  private consolidateWinners(winners: WinnerEntry[]): WinnerEntry[] {
    const map = new Map<string, WinnerEntry>();

    for (const w of winners) {
      const existing = map.get(w.playerId);
      if (existing) {
        existing.amount += w.amount;
        if (w.isHighWinner) existing.isHighWinner = true;
        if (w.isLowWinner)  existing.isLowWinner  = true;
      } else {
        map.set(w.playerId, { ...w });
      }
    }

    return [...map.values()];
  }

  private awardPots(winners: WinnerEntry[]): void {
    for (const w of winners) {
      const p = this.players.find((p) => p.id === w.playerId);
      if (p) p.chips += w.amount;
    }
  }
}
