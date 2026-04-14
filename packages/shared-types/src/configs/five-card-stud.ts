import {
  WinCondition,
  type BettingRound,
  type DealPattern,
  type GameRules,
} from "../rules.js";

// ─── Dealing pattern ──────────────────────────────────────────────────────────
//
// Five-Card Stud is the simplest stud variant. Each player receives exactly
// 5 cards: 1 private (face-down) and 4 exposed (face-up).
//
// Cards are dealt one at a time. The initial deal produces 2 cards — the
// hole card and door card — before the first betting round opens.
//
//  Street         Card #   Cards dealt   Visibility
//  ─────────────────────────────────────────────────
//  Second street  1        1             ↓  (hole card)
//                 2        1             ↑  (door card)      ← bring-in
//  Third street   3        1             ↑                   ← bet
//  Fourth street  4        1             ↑                   ← bet
//  Fifth street   5        1             ↑  ("the river")    ← bet
//
// "Second street" is the conventional name for the state after both the hole
// card and door card have been dealt (the player holds 2 cards). The bring-in
// is posted before action on that street, triggered by the lowest exposed card.

const dealingPattern: DealPattern[] = [
  // ── Second street — initial deal ──────────────────────────────────────────
  //
  // Both cards are dealt before any betting begins. The hole card is private;
  // the door card is exposed. Together they form the "second street" board
  // that determines who must post the bring-in.

  {
    cards:  1,
    faceUp: false,         // hole card — private to the receiving player
    street: "second-street",
  },
  {
    cards:  1,
    faceUp: true,          // door card — exposed to all players
    street: "second-street",
  },

  // ── Third street ──────────────────────────────────────────────────────────
  //
  // One card dealt face-up. The player showing the best one-card board
  // (high card, suit as tiebreaker) now acts first; this order is maintained
  // for all remaining streets.
  {
    cards:  1,
    faceUp: true,
    street: "third-street",
  },

  // ── Fourth street ─────────────────────────────────────────────────────────
  //
  // One card dealt face-up. Each player now holds 3 exposed cards, so pairs
  // and potential hands become visible. In limit games the bet size doubles
  // on fourth street if any player shows an open pair.
  {
    cards:  1,
    faceUp: true,
    street: "fourth-street",
  },

  // ── Fifth street ("the river") ────────────────────────────────────────────
  //
  // The final card is dealt face-up. All 4 community-visible cards are on
  // the board. Players evaluate their complete 5-card hand immediately after
  // the final betting round.
  {
    cards:  1,
    faceUp: true,          // river — exposed; no face-down river unlike 7-card stud
    street: "fifth-street",
  },
];

// ─── Betting rounds ───────────────────────────────────────────────────────────
//
// There are four betting rounds — one after each dealing action following the
// initial two-card deal. The bring-in opens the very first round.
//
// Bring-in rule: the player showing the **lowest** door card (with suit as
// tiebreaker: spades > hearts > diamonds > clubs) must post a mandatory
// partial bet. They may complete to the full small bet; action continues
// clockwise. On all subsequent streets the player with the **best** visible
// hand acts first.

const bettingRounds: BettingRound[] = [
  // ── After second card (second street) ────────────────────────────────────
  //
  // Bring-in round. Triggered immediately after both the hole card and door
  // card have been dealt. The player with the lowest exposed card is forced
  // to open; all others may call, raise, or fold.
  {
    afterStreet: "second-street",
    bringIn:     true,
  },

  // ── After third card (third street) ──────────────────────────────────────
  //
  // Standard round; no forced bet. The player showing the highest exposed
  // hand acts first. In limit games, bets are at the small-bet level unless
  // an open pair appeared — in that case the big-bet option is available.
  {
    afterStreet: "third-street",
    bringIn:     false,
  },

  // ── After fourth card (fourth street) ────────────────────────────────────
  //
  // Standard round. The full big-bet level applies in structured-limit play.
  // Players now have 3 visible cards; reading opponents' board hands becomes
  // the key skill.
  {
    afterStreet: "fourth-street",
    bringIn:     false,
  },

  // ── After fifth card / river (fifth street) ───────────────────────────────
  //
  // Final betting round. Each player's complete 5-card hand is visible except
  // for the one hole card. Followed immediately by showdown.
  {
    afterStreet: "fifth-street",
    bringIn:     false,
  },
];

// ─── fiveCardStudRules ────────────────────────────────────────────────────────

/**
 * Complete `GameRules` configuration for standard Five-Card Stud (high only).
 *
 * ## Game flow
 *
 * ```
 * Ante phase
 *   └─ All players post an ante.
 *
 * Second street  (initial deal)
 *   ├─ Deal: 1 face-down (hole), 1 face-up (door) to each player.
 *   └─ Betting: lowest door card posts the bring-in; action clockwise.
 *
 * Third street
 *   ├─ Deal: 1 face-up to each player.
 *   └─ Betting: best board hand acts first.
 *
 * Fourth street
 *   ├─ Deal: 1 face-up to each player.
 *   └─ Betting: best board hand acts first; big-bet if open pair showing.
 *
 * Fifth street  ("the river")
 *   ├─ Deal: 1 face-up to each player.
 *   └─ Betting: final round before showdown.
 *
 * Showdown
 *   └─ Best 5-card high hand wins (hand is exactly 5 cards — no selection needed).
 * ```
 *
 * ## Key differences from Seven-Card Stud
 *
 * | | Five-Card Stud | Seven-Card Stud |
 * |---|---|---|
 * | Total cards | 5 | 7 |
 * | Private cards | 1 | 3 |
 * | Exposed cards | 4 | 4 |
 * | Betting rounds | 4 | 5 |
 * | Hand selection | None (uses all 5) | Best 5 of 7 |
 * | River card | Face-**up** | Face-down |
 *
 * ## Hand evaluation
 *
 * Uses the high-hand evaluator (`HandEvaluator` from `@poker/game-engine`).
 * Because players hold exactly 5 cards, `evaluateFive` is called directly —
 * there is no best-of-seven combination step.
 *
 * ## Usage
 *
 * ```ts
 * import { fiveCardStudRules } from "@poker/shared-types";
 *
 * const engine = new GameEngine(roomId, fiveCardStudRules.id, {
 *   maxPlayers: fiveCardStudRules.maxCards,   // 5-card stud supports up to ~8
 *   anteRequired: fiveCardStudRules.anteRequired,
 * });
 * ```
 */
export const fiveCardStudRules: Readonly<GameRules> = {
  id:              "five-card-stud",
  name:            "Five-Card Stud",
  family:          "five-card-stud",
  handEvaluator:   "high",
  winCondition:    WinCondition.HIGHEST_HAND,
  maxCards:        5,
  anteRequired:    true,
  bringInRequired: true,
  dealingPattern,
  bettingRounds,
} as const;
