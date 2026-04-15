import type { GameVariant, StakesPreset } from "../types/game";

/**
 * All supported poker variants.
 * The id is sent to the server as `gameType` in the create-room payload.
 */
export const GAME_REGISTRY: GameVariant[] = [
  {
    id: "5-card-stud",
    name: "5 Card Stud",
    description:
      "Classic five-card stud. Each player receives 1 card face-down and 4 face-up across four betting rounds. Best five-card hand wins.",
  },
  {
    id: "5-card-stud-low",
    name: "5 Card Stud Low",
    description:
      "Low variant of five-card stud. The lowest hand wins. Aces are high, straights and flushes count against you.",
  },
  {
    id: "5-card-stud-high-low",
    name: "5 Card Stud High-Low",
    description:
      "Split-pot variant. Best high hand and best low hand each win half the pot. Players declare high, low, or both at showdown.",
  },
  {
    id: "7-card-stud",
    name: "7 Card Stud",
    description:
      "Seven-card stud: 2 cards face-down, 4 face-up, 1 face-down. Five betting rounds. Best five-card hand from seven cards wins.",
  },
  {
    id: "razz",
    name: "Razz",
    description:
      "Razz: Lowest hand wins, aces are low. Straights and flushes are ignored. Best five-card low hand from seven cards wins.",
  },
  {
    id: "7-card-stud-high-low",
    name: "7 Card Stud High-Low",
    description:
      "Split-pot seven-card stud. Best high and best qualifying low hand (8 or better) each take half the pot.",
  },
];

/** Preset stake tiers. `bringIn` is treated as the big-bet for buy-in calculations. */
export const STAKES_PRESETS: StakesPreset[] = [
  { label: "$0.25/$0.50", ante: 0.25, bringIn: 0.5 },
  { label: "$1/$2", ante: 1, bringIn: 2 },
  { label: "$5/$10", ante: 5, bringIn: 10 },
  { label: "$10/$20", ante: 10, bringIn: 20 },
];
