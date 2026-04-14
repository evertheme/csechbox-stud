import {
  WinCondition,
  SpecialRuleType,
  type GameRules,
  sevenCardStudRules,
} from "@poker/shared-types";

// ─── Seven-Card Stud Hi-Lo (Eight-or-Better) ─────────────────────────────────
//
// Also known as "Stud/8" or "Seven-Card Stud Hi-Lo Eight-or-Better".
//
// The dealing and betting structure is identical to standard Seven-Card Stud.
// At showdown the pot is split equally between:
//
//   HIGH half — the best standard (high poker) hand
//   LOW half  — the best Ace-to-Five low hand, **if** it qualifies
//
// Low qualifier: the low hand must be 8-high or better, meaning no card in the
// five-card low hand may exceed rank 8 (8-7-6-5-4 is the worst qualifying low).
// If no player holds a qualifying low hand, the high-hand winner scoops the
// entire pot.
//
// A single player may win both halves ("scoop") if they hold both the best high
// hand and the best qualifying low hand simultaneously — a significant strategic
// goal.
//
// Street summary (mirroring Seven-Card Stud):
//
//   Third street   — 2 hole cards + 1 door card; bring-in by lowest up-card
//   Fourth street  — 1 face-up card; betting round
//   Fifth street   — 1 face-up card; betting round (bets typically double)
//   Sixth street   — 1 face-up card; betting round
//   Seventh street — 1 face-down card; final betting round
//   Showdown       — pot split between best high hand and best qualifying low

/**
 * Complete `GameRules` configuration for **Seven-Card Stud Hi-Lo**
 * (Eight-or-Better).
 *
 * ## Game flow
 * Identical dealing and betting to standard Seven-Card Stud.  At showdown the
 * pot is split: the best high hand wins one half, and the best qualifying
 * Ace-to-Five low hand (8-high or better) wins the other half.  If no low
 * qualifies, the best high hand wins the whole pot.
 *
 * ## Win condition
 * `WinCondition.HIGH_LOW_SPLIT` — the engine evaluates both directions.
 * - High half: `HandEvaluator` (standard high poker).
 * - Low half: `LowHandEvaluator` (Ace-to-Five), restricted to qualifying hands.
 *
 * ## Eight-or-Better qualifier
 * The `EIGHT_OR_BETTER` special rule signals that a low hand is only eligible
 * for the low half of the pot when all five of its cards have rank ≤ 8.
 * Worst qualifying low: `8-7-6-5-4`.  Best: `A-2-3-4-5` (wheel).
 *
 * ## Key differences from Seven-Card Stud (high)
 * | Attribute          | Seven-Card Stud      | Seven-Card Stud Hi-Lo     |
 * |--------------------|----------------------|---------------------------|
 * | `winCondition`     | `HIGHEST_HAND`       | `HIGH_LOW_SPLIT`          |
 * | Low evaluator used | no                   | yes (`LowHandEvaluator`)  |
 * | Low qualifier      | n/a                  | 8-high or better          |
 * | Scoop possible     | n/a                  | yes                       |
 *
 * @example
 * import { sevenStudHighLowRules } from "@poker/game-engine/rules/seven-stud-high-low";
 * const engine = new GameEngine(sevenStudHighLowRules);
 */
export const sevenStudHighLowRules: Readonly<GameRules> = {
  id:              "seven-card-stud-hi-lo",
  name:            "Seven-Card Stud Hi-Lo (Eight-or-Better)",
  family:          "seven-card-stud",
  handEvaluator:   "high",
  winCondition:    WinCondition.HIGH_LOW_SPLIT,
  maxCards:        7,
  anteRequired:    true,
  bringInRequired: true,
  // Dealing and betting structure is identical to standard Seven-Card Stud.
  dealingPattern:  sevenCardStudRules.dealingPattern,
  bettingRounds:   sevenCardStudRules.bettingRounds,
  specialRules: [
    {
      // Low hand must be 8-high or better to qualify for the low half of the
      // pot.  If no player qualifies, the best high hand scoops the whole pot.
      type:      SpecialRuleType.EIGHT_OR_BETTER,
      condition: "low-qualifier",
      award:     "half-pot",
    },
  ],
} as const;
