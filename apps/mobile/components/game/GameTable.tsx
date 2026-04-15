/**
 * GameTable — the green felt oval with all player seats arranged around it.
 *
 * Layout algorithm
 * ────────────────
 * Players are positioned in a horseshoe / elliptical arc.  The local player
 * ("me") is always rendered at the bottom outside the radial grid, giving
 * them a dedicated bottom strip.  Opponents fill numbered seat positions
 * computed from their count:
 *
 *   1 opp  → top-center
 *   2 opps → top-left, top-right
 *   3 opps → top-left, top-center, top-right
 *   4 opps → left, top-left, top-right, right
 *   5–7    → left-edge, top-left, …, top-right, right-edge
 *
 * Positions are expressed as [left%, top%] relative to the table container so
 * they scale with the device's available width.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { PlayerSeat } from "./PlayerSeat";
import type { Card } from "../../types/poker";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TablePlayer {
  id: string;
  username: string;
  chips: number;
  cards: Card[];
  currentBet: number;
  isFolded: boolean;
  isAllIn?: boolean;
  isActive: boolean;
  isDealer?: boolean;
  actionLabel?: string | null;
}

export interface GameTableProps {
  opponents: TablePlayer[];
  pot: number;
  currentBet: number;
  /** Formatted street name shown in the center, e.g. "3rd Street" */
  streetLabel?: string;
  testID?: string;
}

// ─── Seat position lookup (left%, top%) for each opponent count ───────────────

const SEAT_POSITIONS: [number, number][][] = [
  [],
  // 1 opponent
  [[50, 4]],
  // 2 opponents
  [[20, 4], [80, 4]],
  // 3 opponents
  [[15, 4], [50, 4], [85, 4]],
  // 4 opponents
  [[2, 30], [25, 4], [75, 4], [98, 30]],
  // 5 opponents
  [[2, 35], [18, 4], [50, 4], [82, 4], [98, 35]],
  // 6 opponents
  [[2, 45], [2, 12], [30, 4], [70, 4], [98, 12], [98, 45]],
  // 7 opponents
  [[2, 50], [2, 18], [22, 4], [50, 4], [78, 4], [98, 18], [98, 50]],
];

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTAINER_HEIGHT = 280; // px — total height of the felt + seat grid area
const SEAT_WIDTH  = 120;
const SEAT_HALF_W = SEAT_WIDTH / 2;

// ─── Component ────────────────────────────────────────────────────────────────

export function GameTable({
  opponents,
  pot,
  currentBet,
  streetLabel,
  testID,
}: GameTableProps) {
  const { width: screenWidth } = useWindowDimensions();

  const positions = useMemo(
    () => SEAT_POSITIONS[Math.min(opponents.length, 7)] ?? [],
    [opponents.length]
  );

  return (
    <View
      style={[styles.container, { height: CONTAINER_HEIGHT }]}
      testID={testID ?? "game-table"}
    >
      {/* ── Green felt oval ──────────────────────────────────────────── */}
      <View style={styles.feltOval} testID="felt-oval">
        <Text style={styles.potLabel} testID="pot-display">
          POT: ${pot.toLocaleString()}
        </Text>
        {currentBet > 0 && (
          <Text style={styles.betLabel} testID="current-bet-display">
            Bet: ${currentBet}
          </Text>
        )}
        {streetLabel ? (
          <Text style={styles.streetLabel} testID="street-label">
            {streetLabel}
          </Text>
        ) : null}
      </View>

      {/* ── Opponent seats ───────────────────────────────────────────── */}
      {opponents.map((player, idx) => {
        const pos = positions[idx] ?? [50, 4];
        const [leftPct, topPct] = pos;

        // Convert percentages to absolute pixels.
        const left = (leftPct / 100) * screenWidth - SEAT_HALF_W;
        const top  = (topPct  / 100) * CONTAINER_HEIGHT;

        return (
          <View
            key={player.id}
            style={[styles.seatWrapper, { left, top }]}
            testID={`seat-wrapper-${player.id}`}
          >
            <PlayerSeat
              playerId={player.id}
              username={player.username}
              chips={player.chips}
              cards={player.cards}
              currentBet={player.currentBet}
              isActive={player.isActive}
              isFolded={player.isFolded}
              isAllIn={player.isAllIn}
              isDealer={player.isDealer}
              actionLabel={player.actionLabel}
            />
          </View>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: "100%",
    position: "relative",
  },
  feltOval: {
    position: "absolute",
    left: "20%",
    right: "20%",
    top: "30%",
    bottom: "5%",
    backgroundColor: "#0a5f38",
    borderRadius: 60,
    borderWidth: 6,
    borderColor: "#083d24",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  potLabel: {
    fontSize: 16,
    color: "#ffd700",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  betLabel: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
  },
  streetLabel: {
    fontSize: 11,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  seatWrapper: {
    position: "absolute",
  },
});
