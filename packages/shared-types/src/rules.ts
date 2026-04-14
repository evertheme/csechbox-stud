import type { Rank } from "./poker.js";

// ─── Primitive aliases ────────────────────────────────────────────────────────

/**
 * Named street identifiers used in stud-family games.
 * `string & {}` keeps the type open for custom names while still providing
 * autocomplete for the standard values.
 */
export type StreetName =
  | "ante"
  | "second-street"
  | "third-street"
  | "fourth-street"
  | "fifth-street"
  | "sixth-street"
  | "seventh-street"
  | "showdown"
  | (string & {});

/**
 * Which evaluator should score hands for this variant.
 * Maps directly to `HandEvaluator` (high) and `LowHandEvaluator` (low / razz)
 * in the game-engine package.
 */
export type HandEvaluatorType = "high" | "low" | "razz";

/** Top-level poker family a variant belongs to. */
export type GameFamily = "five-card-stud" | "seven-card-stud";

// ─── Dealing ──────────────────────────────────────────────────────────────────

/**
 * Describes a single dealing action within a street.
 *
 * @example
 * // Deal one card face-down ("hole card") on third street
 * const hole: DealPattern = { cards: 1, faceUp: false, street: "third-street" };
 *
 * @example
 * // Deal one card face-up on fourth street
 * const door: DealPattern = { cards: 1, faceUp: true, street: "fourth-street" };
 */
export interface DealPattern {
  /** Number of cards to deal in this action. */
  cards: number;

  /**
   * `true`  → card(s) dealt face-up (visible to all players).
   * `false` → card(s) dealt face-down (visible only to the receiving player).
   */
  faceUp: boolean;

  /**
   * The street this dealing action belongs to.
   * Use {@link StreetName} literals for standard stud games.
   *
   * @example "third-street"
   * @example "fourth-street"
   */
  street?: StreetName;
}

// ─── Betting ──────────────────────────────────────────────────────────────────

/**
 * Describes a betting round that occurs after a specific street.
 *
 * @example
 * // Bring-in betting after cards are dealt on third street
 * const thirdStreetBet: BettingRound = {
 *   afterStreet: "third-street",
 *   bringIn: true,
 * };
 */
export interface BettingRound {
  /**
   * The street after which this betting round takes place.
   * Should match a {@link StreetName} used in {@link DealPattern.street}.
   */
  afterStreet: StreetName;

  /**
   * When `true`, the player with the lowest visible card must post a
   * mandatory partial bet (the "bring-in") to open the round.
   * Typically `true` only on the first betting street of stud games.
   *
   * @default false
   */
  bringIn?: boolean;

  /**
   * Minimum bet size for this round (in chip units).
   * If omitted, the table's big-blind / structured-bet amount applies.
   */
  minBet?: number;
}

// ─── Win conditions ───────────────────────────────────────────────────────────

/**
 * Determines how the pot is awarded at showdown.
 *
 * - `HIGHEST_HAND`  — Standard high poker: the best hand wins the whole pot.
 * - `LOWEST_HAND`   — Pure lowball: the worst high-poker hand wins.
 * - `HIGH_LOW_SPLIT`— The pot is split equally between the best high hand and
 *                     the best qualifying low hand (e.g. Eight-or-Better).
 */
export enum WinCondition {
  HIGHEST_HAND  = "highest-hand",
  LOWEST_HAND   = "lowest-hand",
  HIGH_LOW_SPLIT = "high-low-split",
}

// ─── Special rules ────────────────────────────────────────────────────────────

/**
 * The category of a special rule modifier applied to a game variant.
 *
 * | Value | Effect |
 * |---|---|
 * | `WILD_CARD` | A specific rank (or "bug") acts as a wild card. |
 * | `EIGHT_OR_BETTER` | Low hand must be 8-high or better to qualify for the low half of the pot. |
 * | `BONUS_HIGH_SPADE` | The player holding the highest spade in the hole wins a side bonus. |
 * | `KILL_HAND` | If a player wins two consecutive pots, the next hand is played for double stakes. |
 */
export enum SpecialRuleType {
  WILD_CARD         = "wild-card",
  EIGHT_OR_BETTER   = "eight-or-better",
  BONUS_HIGH_SPADE  = "bonus-high-spade",
  KILL_HAND         = "kill-hand",
}

/**
 * A single special rule modifier applied on top of base game rules.
 *
 * @example
 * // Joker / bug acts as an ace or completes straights and flushes
 * const jokerRule: SpecialRule = {
 *   type: SpecialRuleType.WILD_CARD,
 *   card: "A",          // the "bug" can only stand in for an Ace
 *   condition: "bug",   // sub-type: restricted wild
 *   award: "completes-straight-or-flush",
 * };
 *
 * @example
 * // Half-pot bonus for highest spade dealt face-down
 * const highSpadeRule: SpecialRule = {
 *   type: SpecialRuleType.BONUS_HIGH_SPADE,
 *   condition: "hole-card-only",
 *   award: "half-pot",
 * };
 */
export interface SpecialRule {
  /** The kind of special rule being applied. */
  type: SpecialRuleType;

  /**
   * The card rank involved in this rule, if applicable.
   * For {@link SpecialRuleType.WILD_CARD}, this identifies which rank is wild.
   */
  card?: Rank;

  /**
   * Free-form condition string that qualifies when / how the rule applies.
   * @example "hole-card-only"   — only face-down cards are eligible
   * @example "bug"              — restricted wild (ace / straight / flush only)
   * @example "consecutive-wins" — for kill-hand triggers
   */
  condition?: string;

  /**
   * What the qualifying player receives.
   * @example "half-pot"
   * @example "side-pot"
   * @example "bonus-chip"
   * @example "double-stakes"
   */
  award?: string;
}

// ─── Root game-rules definition ───────────────────────────────────────────────

/**
 * Complete, self-contained description of a poker variant's rules.
 *
 * A `GameRules` object fully determines how a round is dealt, bet, and won —
 * with no additional external state.  It can be serialised to JSON for
 * storage or transmission, and reconstructed on any client.
 *
 * @example
 * // Minimal Seven-Card Stud (high)
 * const studRules: GameRules = {
 *   id: "seven-card-stud-high",
 *   name: "Seven-Card Stud",
 *   family: "seven-card-stud",
 *   dealingPattern: [ ... ],
 *   bettingRounds: [ ... ],
 *   handEvaluator: "high",
 *   winCondition: WinCondition.HIGHEST_HAND,
 *   maxCards: 7,
 *   anteRequired: true,
 *   bringInRequired: true,
 * };
 */
export interface GameRules {
  /**
   * Stable identifier for this variant.
   * Use kebab-case.  Should be globally unique within your rule registry.
   * @example "seven-card-stud-hi-lo"
   */
  id: string;

  /** Display name shown to players. */
  name: string;

  /**
   * The broad poker family this variant belongs to.
   * Used to select the correct dealing engine and street structure.
   */
  family: GameFamily;

  /**
   * Ordered list of dealing actions that fully describe when and how cards
   * are distributed.  Actions are processed in array order.
   *
   * For seven-card stud the typical sequence is:
   * `[hole, hole, door, fourth, fifth, sixth, seventh]`
   */
  dealingPattern: DealPattern[];

  /**
   * Ordered list of betting rounds.  Each entry corresponds to one pause for
   * player action after a set of cards has been dealt.
   *
   * `afterStreet` values should reference streets defined in
   * {@link dealingPattern}.
   */
  bettingRounds: BettingRound[];

  /**
   * Which evaluator resolves hand strength at showdown.
   *
   * | Value  | Evaluator used |
   * |--------|----------------|
   * | `"high"` | `HandEvaluator` (standard high poker) |
   * | `"low"`  | `LowHandEvaluator` (Ace-to-Five) |
   * | `"razz"` | `LowHandEvaluator` (identical algorithm; alias for Razz) |
   */
  handEvaluator: HandEvaluatorType;

  /**
   * How the pot is distributed at showdown.
   * Use {@link WinCondition.HIGH_LOW_SPLIT} together with
   * {@link SpecialRuleType.EIGHT_OR_BETTER} for hi-lo split games.
   */
  winCondition: WinCondition;

  /**
   * Maximum number of cards a player may hold at any point.
   * Typically `5` for five-card variants, `7` for seven-card variants.
   */
  maxCards: number;

  /**
   * When `true`, all players must post an ante before cards are dealt.
   * Standard for stud games; absent from most flop games.
   */
  anteRequired: boolean;

  /**
   * When `true`, the first betting round opens with a mandatory partial bet
   * from the player holding the worst (or best, by variant) visible card.
   */
  bringInRequired: boolean;

  /**
   * Optional list of special rule modifiers layered on top of the base rules.
   * Applied in array order; later rules may override earlier ones.
   */
  specialRules?: SpecialRule[];
}

// ─── Predefined rule configurations ──────────────────────────────────────────

/**
 * Standard Seven-Card Stud (high only).
 *
 * Structure:
 * - Ante required.
 * - Each player receives 2 hole cards + 1 door card (third street).
 * - Three more face-up cards (fourth–sixth street).
 * - One final hole card (seventh street / "the river").
 * - Five betting rounds; bring-in on third street.
 */
export const SEVEN_CARD_STUD: GameRules = {
  id: "seven-card-stud",
  name: "Seven-Card Stud",
  family: "seven-card-stud",
  maxCards: 7,
  anteRequired: true,
  bringInRequired: true,
  handEvaluator: "high",
  winCondition: WinCondition.HIGHEST_HAND,
  dealingPattern: [
    { cards: 1, faceUp: false, street: "third-street" },
    { cards: 1, faceUp: false, street: "third-street" },
    { cards: 1, faceUp: true,  street: "third-street" },
    { cards: 1, faceUp: true,  street: "fourth-street" },
    { cards: 1, faceUp: true,  street: "fifth-street" },
    { cards: 1, faceUp: true,  street: "sixth-street" },
    { cards: 1, faceUp: false, street: "seventh-street" },
  ],
  bettingRounds: [
    { afterStreet: "third-street",   bringIn: true },
    { afterStreet: "fourth-street",  bringIn: false },
    { afterStreet: "fifth-street",   bringIn: false },
    { afterStreet: "sixth-street",   bringIn: false },
    { afterStreet: "seventh-street", bringIn: false },
  ],
};

/**
 * Razz — Seven-Card Stud played for the **lowest** hand.
 *
 * Identical dealing / betting structure to standard stud.
 * Straights and flushes are ignored; Aces are always low.
 * The best hand is A-2-3-4-5 (the "wheel").
 */
export const RAZZ: GameRules = {
  id: "razz",
  name: "Razz",
  family: "seven-card-stud",
  maxCards: 7,
  anteRequired: true,
  bringInRequired: true,
  handEvaluator: "razz",
  winCondition: WinCondition.LOWEST_HAND,
  dealingPattern: SEVEN_CARD_STUD.dealingPattern,
  bettingRounds: SEVEN_CARD_STUD.bettingRounds,
};

/**
 * Seven-Card Stud Hi-Lo (Eight-or-Better).
 *
 * The pot is split between the best **high** hand and the best **qualifying
 * low** hand.  A low hand must be 8-high or better to qualify.
 * If no low hand qualifies, the high hand scoops the whole pot.
 */
export const SEVEN_CARD_STUD_HI_LO: GameRules = {
  id: "seven-card-stud-hi-lo",
  name: "Seven-Card Stud Hi-Lo (Eight-or-Better)",
  family: "seven-card-stud",
  maxCards: 7,
  anteRequired: true,
  bringInRequired: true,
  handEvaluator: "high",
  winCondition: WinCondition.HIGH_LOW_SPLIT,
  dealingPattern: SEVEN_CARD_STUD.dealingPattern,
  bettingRounds: SEVEN_CARD_STUD.bettingRounds,
  specialRules: [
    {
      type: SpecialRuleType.EIGHT_OR_BETTER,
      condition: "low-qualifier",
      award: "half-pot",
    },
  ],
};

/**
 * Five-Card Stud (high only).
 *
 * Structure:
 * - Ante required.
 * - Each player receives 1 hole card + 1 door card (second street).
 * - Three more face-up cards (third–fifth street).
 * - Four betting rounds; bring-in on second street.
 */
export const FIVE_CARD_STUD: GameRules = {
  id: "five-card-stud",
  name: "Five-Card Stud",
  family: "five-card-stud",
  maxCards: 5,
  anteRequired: true,
  bringInRequired: true,
  handEvaluator: "high",
  winCondition: WinCondition.HIGHEST_HAND,
  dealingPattern: [
    { cards: 1, faceUp: false, street: "third-street" },
    { cards: 1, faceUp: true,  street: "third-street" },
    { cards: 1, faceUp: true,  street: "fourth-street" },
    { cards: 1, faceUp: true,  street: "fifth-street" },
    { cards: 1, faceUp: true,  street: "sixth-street" },
  ],
  bettingRounds: [
    { afterStreet: "third-street",  bringIn: true  },
    { afterStreet: "fourth-street", bringIn: false },
    { afterStreet: "fifth-street",  bringIn: false },
    { afterStreet: "sixth-street",  bringIn: false },
  ],
};

/**
 * Five-Card Stud Low (Ace-to-Five).
 * Identical dealing structure to {@link FIVE_CARD_STUD}; lowest hand wins.
 */
export const FIVE_CARD_STUD_LOW: GameRules = {
  id: "five-card-stud-low",
  name: "Five-Card Stud Low",
  family: "five-card-stud",
  maxCards: 5,
  anteRequired: true,
  bringInRequired: true,
  handEvaluator: "low",
  winCondition: WinCondition.LOWEST_HAND,
  dealingPattern: FIVE_CARD_STUD.dealingPattern,
  bettingRounds: FIVE_CARD_STUD.bettingRounds,
};

/**
 * All built-in game rule definitions, keyed by their `id`.
 * Import and spread this to build a rule registry:
 *
 * @example
 * const registry = { ...PREDEFINED_RULES, ...customRules };
 * const rules = registry["razz"];
 */
export const PREDEFINED_RULES: Readonly<Record<string, GameRules>> = {
  [SEVEN_CARD_STUD.id]:       SEVEN_CARD_STUD,
  [RAZZ.id]:                  RAZZ,
  [SEVEN_CARD_STUD_HI_LO.id]: SEVEN_CARD_STUD_HI_LO,
  [FIVE_CARD_STUD.id]:        FIVE_CARD_STUD,
  [FIVE_CARD_STUD_LOW.id]:    FIVE_CARD_STUD_LOW,
};

// ─── Utility types ────────────────────────────────────────────────────────────

/**
 * Extracts the union of all valid `id` values from {@link PREDEFINED_RULES}.
 * Useful for typed lookups:
 *
 * @example
 * function getBuiltinRules(id: PredefinedRuleId): GameRules { ... }
 */
export type PredefinedRuleId = keyof typeof PREDEFINED_RULES;

/**
 * A `GameRules` object without the `id` and `name` fields — useful when
 * building a new variant from an existing one via spread:
 *
 * @example
 * const wildStudRules: GameRules = {
 *   id: "wild-stud",
 *   name: "Wild Card Stud",
 *   ...SEVEN_CARD_STUD_BASE,
 *   specialRules: [{ type: SpecialRuleType.WILD_CARD, card: "2" }],
 * };
 */
export type GameRulesBase = Omit<GameRules, "id" | "name">;

/**
 * A partial override record used when patching an existing {@link GameRules}
 * object for house-rule variations.
 *
 * @example
 * function applyHouseRules(base: GameRules, patch: GameRulesPatch): GameRules {
 *   return { ...base, ...patch, id: `${base.id}-custom` };
 * }
 */
export type GameRulesPatch = Partial<Omit<GameRules, "id" | "family">>;
