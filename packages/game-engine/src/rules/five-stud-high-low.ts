import {
  WinCondition,
  SpecialRuleType,
  type GameRules,
  fiveCardStudRules,
} from "@poker/shared-types";

// ─── Five-Card Stud Hi-Lo (Eight-or-Better) ───────────────────────────────────
//
// A hi-lo split variant of Five-Card Stud.  The dealing and betting structure
// is identical to standard Five-Card Stud.  At showdown the pot is split
// between:
//
//   HIGH half — the best standard (high poker) hand
//   LOW half  — the best qualifying Ace-to-Five low hand
//
// Low qualifier: the low hand must be 8-high or better (no card may rank above
// 8).  Worst qualifying low: 8-7-6-5-4.  Best qualifying low: A-2-3-4-5.
// If no player holds a qualifying low hand, the high-hand winner scoops.
//
// Five-Card Stud Hi-Lo is a rare but legitimate variant; it has a tighter low-
// qualifier pressure than the seven-card version because players only hold five
// cards rather than seven, making it harder to build a qualifying low.
//
// Street summary (mirroring Five-Card Stud):
//
//   Second street  — 1 hole card + 1 door card; bring-in by lowest up-card
//   Third street   — 1 face-up card; betting round
//   Fourth street  — 1 face-up card; betting round
//   Fifth street   — 1 face-up card (river); final betting round
//   Showdown       — pot split between best high hand and best qualifying low

/**
 * Complete `GameRules` configuration for **Five-Card Stud Hi-Lo**
 * (Eight-or-Better).
 *
 * ## Game flow
 * Identical dealing and betting to standard Five-Card Stud.  At showdown the
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
 * when all five of its cards have rank ≤ 8.  Because players only receive five
 * cards total, there is no opportunity to discard unqualified cards — the
 * entire hand must qualify, making low hands rarer than in the seven-card
 * version.
 *
 * ## Key differences from Five-Card Stud (high)
 * | Attribute          | Five-Card Stud       | Five-Card Stud Hi-Lo      |
 * |--------------------|----------------------|---------------------------|
 * | `winCondition`     | `HIGHEST_HAND`       | `HIGH_LOW_SPLIT`          |
 * | Low evaluator used | no                   | yes (`LowHandEvaluator`)  |
 * | Low qualifier      | n/a                  | 8-high or better          |
 * | Scoop possible     | n/a                  | yes                       |
 *
 * ## Key differences from Seven-Card Stud Hi-Lo
 * | Attribute          | Seven-Card Stud Hi-Lo | Five-Card Stud Hi-Lo      |
 * |--------------------|----------------------|---------------------------|
 * | `maxCards`         | 7                    | 5                         |
 * | Cards dealt down   | 3                    | 1                         |
 * | Low frequency      | moderate             | rare (fewer cards to use) |
 * | Streets            | 5 betting rounds     | 4 betting rounds          |
 *
 * @example
 * import { fiveStudHighLowRules } from "@poker/game-engine/rules/five-stud-high-low";
 * const engine = new GameEngine(fiveStudHighLowRules);
 */
export const fiveStudHighLowRules: Readonly<GameRules> = {
  id:              "five-card-stud-hi-lo",
  name:            "Five-Card Stud Hi-Lo (Eight-or-Better)",
  family:          "five-card-stud",
  handEvaluator:   "high",
  winCondition:    WinCondition.HIGH_LOW_SPLIT,
  maxCards:        5,
  anteRequired:    true,
  bringInRequired: true,
  // Dealing and betting structure is identical to standard Five-Card Stud.
  dealingPattern:  fiveCardStudRules.dealingPattern,
  bettingRounds:   fiveCardStudRules.bettingRounds,
  specialRules: [
    {
      // Low hand must be 8-high or better to qualify for the low half of the
      // pot.  In 5-card stud this is harder to achieve than in 7-card stud
      // since players cannot pick the best 5 from 7 — the full hand must meet
      // the qualifier.  If no player qualifies, the high hand scoops the pot.
      type:      SpecialRuleType.EIGHT_OR_BETTER,
      condition: "low-qualifier",
      award:     "half-pot",
    },
  ],
} as const;
