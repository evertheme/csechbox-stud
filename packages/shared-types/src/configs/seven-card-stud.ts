import {
  WinCondition,
  type BettingRound,
  type DealPattern,
  type GameRules,
} from "../rules.js";

// ─── Dealing pattern ──────────────────────────────────────────────────────────
//
// Seven-Card Stud deals cards in four distinct streets after the ante.
// Each player ends up with a maximum of 7 cards: 3 private (face-down) and
// 4 exposed (face-up).
//
//  Street         Cards dealt        Visibility
//  ─────────────────────────────────────────────
//  Third street   2 + 1              ↓↓↑  (two hole + one door)
//  Fourth street  1                  ↑
//  Fifth street   1                  ↑
//  Sixth street   1                  ↑
//  Seventh street 1                  ↓    (the "river" – dealt face-down)
//
// Each object below represents one dealing action. Actions are applied in
// array order; multiple entries sharing the same `street` are all dealt
// before any betting begins on that street.

const dealingPattern: DealPattern[] = [
  // ── Third street ─────────────────────────────────────────────────────────
  //
  // The first two cards are hole cards: dealt face-down, visible only to
  // the receiving player. Together with the door card below they form the
  // "starting hand" that kicks off the first betting round.

  {
    cards:  1,
    faceUp: false,         // hole card #1
    street: "third-street",
  },
  {
    cards:  1,
    faceUp: false,         // hole card #2
    street: "third-street",
  },

  // The third card (the "door card") is dealt face-up. The player showing
  // the lowest door card must post the bring-in to open betting.
  {
    cards:  1,
    faceUp: true,          // door card (exposed)
    street: "third-street",
  },

  // ── Fourth street ─────────────────────────────────────────────────────────
  //
  // One card dealt face-up. The player showing the best board hand acts
  // first for all remaining streets.
  {
    cards:  1,
    faceUp: true,
    street: "fourth-street",
  },

  // ── Fifth street ──────────────────────────────────────────────────────────
  //
  // One card dealt face-up. In structured-limit games, the bet size doubles
  // starting on fifth street.
  {
    cards:  1,
    faceUp: true,
    street: "fifth-street",
  },

  // ── Sixth street ──────────────────────────────────────────────────────────
  //
  // One card dealt face-up. Each player now has 4 exposed cards visible to
  // all opponents.
  {
    cards:  1,
    faceUp: true,
    street: "sixth-street",
  },

  // ── Seventh street ("the river") ──────────────────────────────────────────
  //
  // The final card is dealt face-down — back to being private. When the deck
  // runs out in a large game, a single community card is dealt face-up in the
  // centre and shared by all remaining players.
  {
    cards:  1,
    faceUp: false,         // river card (private)
    street: "seventh-street",
  },
];

// ─── Betting rounds ───────────────────────────────────────────────────────────
//
// There is one betting round after each street — five rounds in total.
// The first round (after third street) opens with a mandatory partial bet
// called the "bring-in", posted by the player showing the lowest door card.
// In the event of a tie for lowest door card, suit rank (spades > hearts >
// diamonds > clubs) breaks the tie.

const bettingRounds: BettingRound[] = [
  // ── After third street ────────────────────────────────────────────────────
  //
  // Bring-in round: the player with the lowest exposed card is forced to
  // open for a partial bet (the bring-in amount). They may complete to the
  // full small bet. Action continues clockwise from there.
  {
    afterStreet: "third-street",
    bringIn:     true,
  },

  // ── After fourth street ───────────────────────────────────────────────────
  //
  // Standard betting round; no bring-in. The player showing the best board
  // hand (high card, then best two-card hand) acts first. In limit games,
  // bets are at the small-bet level.
  {
    afterStreet: "fourth-street",
    bringIn:     false,
  },

  // ── After fifth street ────────────────────────────────────────────────────
  //
  // Standard betting round. In limit Stud, bet and raise sizes double to the
  // big-bet level starting here and continuing through seventh street.
  {
    afterStreet: "fifth-street",
    bringIn:     false,
  },

  // ── After sixth street ────────────────────────────────────────────────────
  //
  // Standard betting round at the big-bet level.
  {
    afterStreet: "sixth-street",
    bringIn:     false,
  },

  // ── After seventh street ─────────────────────────────────────────────────
  //
  // Final betting round before showdown. Followed immediately by showdown
  // if more than one player remains.
  {
    afterStreet: "seventh-street",
    bringIn:     false,
  },
];

// ─── sevenCardStudRules ───────────────────────────────────────────────────────

/**
 * Complete `GameRules` configuration for standard Seven-Card Stud (high only).
 *
 * ## Game flow
 *
 * ```
 * Ante phase
 *   └─ All players post an ante.
 *
 * Third street
 *   ├─ Deal: 2 face-down (hole), 1 face-up (door) to each player.
 *   └─ Betting: lowest door card posts the bring-in; action continues clockwise.
 *
 * Fourth street
 *   ├─ Deal: 1 face-up to each player.
 *   └─ Betting: best board hand acts first (small-bet level).
 *
 * Fifth street
 *   ├─ Deal: 1 face-up to each player.
 *   └─ Betting: best board hand acts first (big-bet level).
 *
 * Sixth street
 *   ├─ Deal: 1 face-up to each player.
 *   └─ Betting: big-bet level.
 *
 * Seventh street ("the river")
 *   ├─ Deal: 1 face-down (private) to each player.
 *   └─ Betting: big-bet level.
 *
 * Showdown
 *   └─ Best 5-card high hand from 7 cards wins the pot.
 * ```
 *
 * ## Hand evaluation
 *
 * Uses the high-hand evaluator (`HandEvaluator` from `@poker/game-engine`).
 * Each player selects the best 5 cards from their 7 to form the strongest
 * possible poker hand. Standard hand rankings apply (Royal Flush → High Card).
 *
 * ## Usage
 *
 * ```ts
 * import { sevenCardStudRules } from "@poker/shared-types";
 *
 * const engine = new GameEngine(roomId, sevenCardStudRules.id, {
 *   smallBlind: sevenCardStudRules.bettingRounds[0]?.minBet ?? 5,
 *   bigBlind:   sevenCardStudRules.bettingRounds[0]?.minBet ?? 10,
 *   ...
 * });
 * ```
 */
export const sevenCardStudRules: Readonly<GameRules> = {
  id:              "seven-card-stud",
  name:            "Seven-Card Stud",
  family:          "seven-card-stud",
  handEvaluator:   "high",
  winCondition:    WinCondition.HIGHEST_HAND,
  maxCards:        7,
  anteRequired:    true,
  bringInRequired: true,
  dealingPattern,
  bettingRounds,
} as const;
