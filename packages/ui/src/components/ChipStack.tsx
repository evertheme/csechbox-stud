import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, borderRadius, typography } from "../theme";

interface ChipStackProps {
  amount: number;
  label?: string;
}

function formatChips(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return String(amount);
}

export function ChipStack({ amount, label }: ChipStackProps) {
  return (
    <View style={styles.container}>
      <View style={styles.chip}>
        <Text style={styles.amount}>{formatChips(amount)}</Text>
      </View>
      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 4,
  },
  chip: {
    backgroundColor: colors.chip.black,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 48,
    alignItems: "center",
  },
  amount: {
    color: colors.accent,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
});
