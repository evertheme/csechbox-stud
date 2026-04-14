import {
  fiveCardStudRules,
  sevenCardStudRules,
  type GameRules,
} from "@poker/shared-types";

import { razzRules } from "./razz.js";
import { sevenStudHighLowRules } from "./seven-stud-high-low.js";
import { fiveStudLowRules } from "./five-stud-low.js";
import { fiveStudHighLowRules } from "./five-stud-high-low.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Central mapping of every built-in game variant to its full `GameRules`
 * configuration.  Use this as the single source of truth when a game engine
 * or lobby needs to look up rules by an identifier.
 *
 * Keys are stable kebab-case identifiers.  Values are immutable
 * `Readonly<GameRules>` objects so consumers cannot accidentally mutate them.
 *
 * @example
 * const rules = GAME_REGISTRY["razz"];
 * console.log(rules.handEvaluator); // "razz"
 *
 * @example
 * // Spread to add custom variants
 * const registry = { ...GAME_REGISTRY, "my-wild-stud": myCustomRules };
 */
export const GAME_REGISTRY = {
  "five-card-stud":           fiveCardStudRules,
  "five-card-stud-low":       fiveStudLowRules,
  "five-card-stud-high-low":  fiveStudHighLowRules,
  "seven-card-stud":          sevenCardStudRules,
  "razz":                     razzRules,
  "seven-card-stud-high-low": sevenStudHighLowRules,
} as const satisfies Record<string, GameRules>;

// ─── Derived types ─────────────────────────────────────────────────────────────

/**
 * Union of every valid game-type key in {@link GAME_REGISTRY}.
 * Automatically stays in sync as new variants are added.
 *
 * @example
 * function startGame(type: GameType) { ... }
 * startGame("razz");          // ✓
 * startGame("unknown-game");  // ✗ TypeScript error
 */
export type GameType = keyof typeof GAME_REGISTRY;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the `GameRules` object for the given game type.
 *
 * Because `gameType` is constrained to {@link GameType}, the lookup is
 * exhaustive and never returns `undefined` — no null-check needed at call sites.
 *
 * @param gameType - A valid key from {@link GAME_REGISTRY}.
 * @returns The corresponding `Readonly<GameRules>` configuration.
 *
 * @example
 * const rules = getGameRules("seven-card-stud-high-low");
 * console.log(rules.winCondition); // "high-low-split"
 */
export function getGameRules(gameType: GameType): Readonly<GameRules> {
  return GAME_REGISTRY[gameType];
}

/**
 * Returns an array of every registered game-type identifier.
 *
 * Useful for populating UI selectors, validation allow-lists, or iterating
 * over all variants:
 *
 * @returns A mutable `GameType[]` array (a new array is created each call).
 *
 * @example
 * const types = getAllGameTypes();
 * // ["five-card-stud", "five-card-stud-low", "five-card-stud-high-low",
 * //  "seven-card-stud", "razz", "seven-card-stud-high-low"]
 *
 * @example
 * // Validate an untrusted string
 * const isKnown = (getAllGameTypes() as string[]).includes(input);
 */
export function getAllGameTypes(): GameType[] {
  return Object.keys(GAME_REGISTRY) as GameType[];
}
