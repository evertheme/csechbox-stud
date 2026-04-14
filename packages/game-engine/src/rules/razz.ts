import {
  WinCondition,
  type GameRules,
  sevenCardStudRules,
} from "@poker/shared-types";

// ─── Razz ─────────────────────────────────────────────────────────────────────
//
// Razz is Seven-Card Stud played for the **lowest** hand using Ace-to-Five
// (California) lowball rankings:
//
//   • Straights and flushes are completely ignored.
//   • Aces are always low (rank = 1).
//   • The best possible hand is A-2-3-4-5 (the "wheel" or "bicycle").
//   • Pairs and trips count against you — no-pair hands always beat paired ones.
//
// Dealing and betting structure is identical to standard Seven-Card Stud.
// The only structural difference is the bring-in direction: in Razz the player
// showing the **highest** up-card must post the bring-in (in high stud it is
// the lowest up-card).  The bring-in rule itself is still represented by
// `bringIn: true`; the direction is a runtime concern for the dealing engine.
//
// Street summary (mirroring Seven-Card Stud):
//
//   Third street   — 2 hole cards + 1 door card dealt; bring-in posted
//   Fourth street  — 1 face-up card dealt; betting round
//   Fifth street   — 1 face-up card dealt; betting round (bets typically double)
//   Sixth street   — 1 face-up card dealt; betting round
//   Seventh street — 1 face-down card dealt; final betting round
//   Showdown       — best Razz hand (lowest) scoops the pot

/**
 * Complete `GameRules` configuration for **Razz** (Seven-Card Stud Low).
 *
 * ## Game flow
 * All players ante.  Two hole cards and one face-up door card are dealt
 * (third street).  The player with the **highest** visible card must post the
 * bring-in.  Four more streets follow (one card each), with a betting round
 * after every street.  At showdown the best Ace-to-Five low hand wins.
 *
 * ## Hand ranking
 * Evaluated by `LowHandEvaluator` (`handEvaluator: "razz"`).
 *
 * Best → worst low hands:
 * ```
 * A-2-3-4-5  (wheel — nuts)
 * A-2-3-4-6
 * A-2-3-5-6
 * …
 * 4-5-6-7-8
 * …
 * K-Q-J-T-9  (worst unpaired hand)
 * any pair   (worse than all unpaired hands)
 * ```
 *
 * ## Key differences from Seven-Card Stud (high)
 * | Attribute          | Seven-Card Stud      | Razz                      |
 * |--------------------|----------------------|---------------------------|
 * | `handEvaluator`    | `"high"`             | `"razz"`                  |
 * | `winCondition`     | `HIGHEST_HAND`       | `LOWEST_HAND`             |
 * | Bring-in trigger   | lowest up-card posts | highest up-card posts     |
 * | Aces               | high (value = 14)    | always low (value = 1)    |
 * | Straights/flushes  | count                | ignored                   |
 *
 * @example
 * import { razzRules } from "@poker/game-engine/rules/razz";
 * const engine = new GameEngine(razzRules);
 */
export const razzRules: Readonly<GameRules> = {
  id:              "razz",
  name:            "Razz",
  family:          "seven-card-stud",
  handEvaluator:   "razz",
  winCondition:    WinCondition.LOWEST_HAND,
  maxCards:        7,
  anteRequired:    true,
  bringInRequired: true,
  // Dealing and betting structure is identical to standard Seven-Card Stud.
  dealingPattern:  sevenCardStudRules.dealingPattern,
  bettingRounds:   sevenCardStudRules.bettingRounds,
} as const;
