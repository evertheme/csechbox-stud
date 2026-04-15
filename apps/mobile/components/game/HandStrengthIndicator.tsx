/**
 * HandStrengthIndicator — displays the current hand's ranking.
 *
 * Visibility is controlled by the caller (typically hidden when the game
 * is not in the "playing" or "showdown" phase) and by the
 * showHandStrength setting.
 *
 * The hand description string comes from the server (showdown payload) or
 * from a client-side evaluator; this component just renders it.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HandStrengthIndicatorProps {
  /** Human-readable hand description, e.g. "Pair of Kings", "Flush". */
  description: string | null;
  /** Whether to show this indicator at all (from user settings). */
  visible?: boolean;
  testID?: string;
}

// ─── Hand-rank colour map ─────────────────────────────────────────────────────

const RANK_COLORS: Record<string, string> = {
  "royal flush":   "#ff6b00",
  "straight flush": "#ff9500",
  "four of a kind": "#f59e0b",
  "full house":    "#22c55e",
  "flush":         "#3b82f6",
  "straight":      "#8b5cf6",
  "three of a kind": "#06b6d4",
  "two pair":      "#94a3b8",
  "pair":          "#94a3b8",
  "high card":     "#64748b",
};

function rankColor(description: string): string {
  const lower = description.toLowerCase();
  for (const [key, color] of Object.entries(RANK_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "#94a3b8";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HandStrengthIndicator({
  description,
  visible = true,
  testID,
}: HandStrengthIndicatorProps) {
  if (!visible || !description) return null;

  const color = rankColor(description);

  return (
    <View style={styles.container} testID={testID ?? "hand-strength"}>
      <Text style={styles.label}>Hand:</Text>
      <Text style={[styles.value, { color }]} testID="hand-strength-text">
        {description}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "rgba(22, 33, 62, 0.9)",
    borderTopWidth: 1,
    borderTopColor: "#2d3a56",
  },
  label: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  value: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
});
