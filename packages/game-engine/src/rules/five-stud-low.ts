import {
  WinCondition,
  type GameRules,
  fiveCardStudRules,
} from "@poker/shared-types";

// ─── Five-Card Stud Low ───────────────────────────────────────────────────────
//
// Five-Card Stud Low is Five-Card Stud played for the **lowest** hand using
// Ace-to-Five (California) lowball rankings:
//
//   • Straights and flushes are completely ignored.
//   • Aces are always low (rank = 1).
//   • The best possible hand is A-2-3-4-5 (the "wheel").
//   • Pairs count against you — no-pair hands always beat paired ones.
//
// Dealing and betting structure is identical to standard Five-Card Stud.
// As in Razz, the bring-in direction is reversed: the player holding the
// highest face-up card must post the bring-in.
//
// Street summary (mirroring Five-Card Stud):
//
//   Second street  — 1 hole card + 1 door card dealt; bring-in posted by the
//                    player showing the highest up-card
//   Third street   — 1 face-up card; betting round
//   Fourth street  — 1 face-up card; betting round
//   Fifth street   — 1 face-up card (river); final betting round
//   Showdown       — best Ace-to-Five low hand wins

/**
 * Complete `GameRules` configuration for **Five-Card Stud Low**.
 *
 * ## Game flow
 * All players ante.  One hole card and one face-up door card are dealt
 * (second street).  The player with the **highest** visible card must post the
 * bring-in.  Three more face-up cards follow (third–fifth street), each with
 * its own betting round.  At showdown the best Ace-to-Five low hand wins.
 *
 * ## Hand ranking
 * Evaluated by `LowHandEvaluator` (`handEvaluator: "low"`).
 *
 * Best → worst low hands (same scale as Razz):
 * ```
 * A-2-3-4-5  (wheel — nuts)
 * A-2-3-4-6
 * …
 * any pair   (worse than all unpaired hands)
 * ```
 *
 * ## Key differences from Five-Card Stud (high)
 * | Attribute          | Five-Card Stud       | Five-Card Stud Low        |
 * |--------------------|----------------------|---------------------------|
 * | `handEvaluator`    | `"high"`             | `"low"`                   |
 * | `winCondition`     | `HIGHEST_HAND`       | `LOWEST_HAND`             |
 * | Bring-in trigger   | lowest up-card posts | highest up-card posts     |
 * | Aces               | high (value = 14)    | always low (value = 1)    |
 * | Straights/flushes  | count                | ignored                   |
 *
 * @example
 * import { fiveStudLowRules } from "@poker/game-engine/rules/five-stud-low";
 * const engine = new GameEngine(fiveStudLowRules);
 */
export const fiveStudLowRules: Readonly<GameRules> = {
  id:              "five-card-stud-low",
  name:            "Five-Card Stud Low",
  family:          "five-card-stud",
  handEvaluator:   "low",
  winCondition:    WinCondition.LOWEST_HAND,
  maxCards:        5,
  anteRequired:    true,
  bringInRequired: true,
  // Dealing and betting structure is identical to standard Five-Card Stud.
  dealingPattern:  fiveCardStudRules.dealingPattern,
  bettingRounds:   fiveCardStudRules.bettingRounds,
} as const;
