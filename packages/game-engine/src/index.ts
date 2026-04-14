// =============================================================================
//  @poker/game-engine — public API
// =============================================================================
//
//  Import anything you need directly from this package:
//
//    import { GameEngine, Deck, HandEvaluator, sevenCardStudRules } from "@poker/game-engine";
//
// =============================================================================

// ─── Cards ────────────────────────────────────────────────────────────────────

export {
  /** Card class — represents a single playing card. */
  Card,
  /** Suit enum: SPADES | HEARTS | DIAMONDS | CLUBS */
  Suit,
  /** Rank enum: TWO … ACE */
  Rank,
  /** Ordered array of all four suits. */
  ALL_SUITS,
  /** Ordered array of all thirteen ranks. */
  ALL_RANKS,
} from "./card.js";

// ─── Deck ─────────────────────────────────────────────────────────────────────

export {
  /**
   * 52-card deck with a cryptographically secure Fisher-Yates shuffle.
   * `new Deck().shuffle().deal(5)` — chainable API.
   */
  Deck,
} from "./deck.js";

// ─── Hand evaluation ──────────────────────────────────────────────────────────

export {
  /** Stateless standard (high) poker hand evaluator. */
  HandEvaluator,
  /** Hand type rankings from HIGH_CARD (1) to ROYAL_FLUSH (10). */
  HandType,
  /** Compare two HandRank objects: positive → hand1 wins, 0 → chop. */
  compareHands,
} from "./hand-evaluator.js";

export type {
  /** Result of evaluating a high-poker hand: type, value, cards, description, kickers. */
  HandRank,
} from "./hand-evaluator.js";

export {
  /** Stateless Razz / Ace-to-Five lowball hand evaluator. */
  LowHandEvaluator,
  /** Low hand type rankings: FOUR_OF_KIND (1 = worst) to NO_PAIR (6 = best). */
  LowHandType,
  /** Compare two LowHandRank objects: positive → hand1 wins (lower hand), 0 → chop. */
  compareLowHands,
  /** Type guard: narrows HandRank | LowHandRank to LowHandRank. */
  isLowHandRank,
} from "./low-hand-evaluator.js";

export type {
  /** Result of evaluating a Razz / lowball hand: type, value, cards, description, kickers. */
  LowHandRank,
} from "./low-hand-evaluator.js";

// ─── Game engine ──────────────────────────────────────────────────────────────

export {
  /**
   * Drives a complete hand of stud poker according to a GameRules config.
   *
   * @example
   * const engine = new GameEngine(sevenCardStudRules, ["alice", "bob"]);
   * engine.start();
   * engine.dealCards();
   * engine.bet("alice", 20);
   * engine.call("bob");
   * engine.nextStreet();
   * // … repeat until game-complete event fires
   */
  GameEngine,
} from "./game-engine.js";

export type {
  /** Phase of a hand: waiting → ante → dealing → betting → street-complete → showdown → complete */
  GamePhase,
  /** A card slot held by a player: { card, faceUp }. */
  CardSlot,
  /** Public snapshot of a player's state (all cards visible — server-side). */
  PlayerState,
  /** A pot slice: amount + eligiblePlayerIds. Main pot and each side pot. */
  PotEntry,
  /** Full game state for a server / game controller (includes hole cards). */
  GameState,
  /** Player-scoped view: own cards fully visible; opponents' hole cards hidden. */
  PlayerViewState,
  /** One entry in a showdown result: playerId, amount won, winning hand. */
  WinnerEntry,
  /** Full showdown result: all winners and all evaluated hands. */
  ShowdownResult,
  /** Constructor options for GameEngine: startingChips, anteAmount. */
  GameEngineOptions,
} from "./game-engine.js";

// ─── Game rules — types & enums ───────────────────────────────────────────────
//
//  Re-exported from @poker/shared-types so consumers only need to import from
//  @poker/game-engine for the complete API surface.

export {
  /** How the pot is awarded: HIGHEST_HAND | LOWEST_HAND | HIGH_LOW_SPLIT */
  WinCondition,
  /** Category of a special rule modifier: WILD_CARD | EIGHT_OR_BETTER | … */
  SpecialRuleType,
} from "@poker/shared-types";

export type {
  /** Named street identifier: "third-street" | "fourth-street" | … */
  StreetName,
  /** Which evaluator resolves hands: "high" | "low" | "razz" */
  HandEvaluatorType,
  /** Broad poker family: "five-card-stud" | "seven-card-stud" */
  GameFamily,
  /** Single dealing action: { cards, faceUp, street? } */
  DealPattern,
  /** Single betting round descriptor: { afterStreet, bringIn?, minBet? } */
  BettingRound,
  /** A special rule modifier layered on top of base game rules. */
  SpecialRule,
  /** Complete, self-contained poker variant rule configuration. */
  GameRules,
  /** Utility: union of all built-in game rule IDs. */
  PredefinedRuleId,
  /** GameRules without id and name — useful for building variants by spread. */
  GameRulesBase,
  /** Partial override record for patching an existing GameRules object. */
  GameRulesPatch,
} from "@poker/shared-types";

// ─── Predefined rule configurations ──────────────────────────────────────────
//
//  Ready-to-use GameRules constants for every supported variant.
//  Pass directly to the GameEngine constructor.
//
//  Five-Card variants
export {
  /** Five-Card Stud — high hand wins. 1 hole + 4 face-up cards; 4 betting rounds. */
  fiveCardStudRules,
} from "@poker/shared-types";

export {
  /** Five-Card Stud Low — lowest Ace-to-Five hand wins. */
  fiveStudLowRules,
} from "./rules/five-stud-low.js";

export {
  /** Five-Card Stud Hi-Lo — pot split; 8-or-better qualifier for low. */
  fiveStudHighLowRules,
} from "./rules/five-stud-high-low.js";

//  Seven-Card variants
export {
  /** Seven-Card Stud — high hand wins. 2 hole + 4 face-up + 1 hole; 5 betting rounds. */
  sevenCardStudRules,
} from "@poker/shared-types";

export {
  /** Razz — Seven-Card Stud for the lowest Ace-to-Five hand. */
  razzRules,
} from "./rules/razz.js";

export {
  /** Seven-Card Stud Hi-Lo — pot split; 8-or-better qualifier for low. */
  sevenStudHighLowRules,
} from "./rules/seven-stud-high-low.js";

// ─── Game registry ────────────────────────────────────────────────────────────

export {
  /**
   * Central mapping of every built-in variant ID to its GameRules object.
   *
   * @example
   * const rules = GAME_REGISTRY["razz"];
   * // spread to add custom variants:
   * const registry = { ...GAME_REGISTRY, "my-wild-stud": myRules };
   */
  GAME_REGISTRY,
  /**
   * Look up a variant by its ID — type-safe, never returns undefined.
   *
   * @example
   * const rules = getGameRules("seven-card-stud-high-low");
   */
  getGameRules,
  /**
   * Return an array of every registered game-type identifier.
   *
   * @example
   * const types = getAllGameTypes();
   * // ["five-card-stud", "five-card-stud-low", …]
   */
  getAllGameTypes,
} from "./rules/registry.js";

export type {
  /**
   * Union of all valid game-type keys in GAME_REGISTRY.
   *
   * @example
   * function startGame(type: GameType) { … }
   * startGame("razz");          // ✓
   * startGame("unknown-game");  // ✗ TypeScript error
   */
  GameType,
} from "./rules/registry.js";

// ─── Internal round utility (advanced use) ────────────────────────────────────

export { PokerRound } from "./poker-round.js";
