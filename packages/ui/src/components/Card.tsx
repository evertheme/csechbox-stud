import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { Card as CardType } from "@csechbox/shared-types";
import { colors, borderRadius, typography } from "../theme";

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
}

const SUIT_SYMBOLS: Record<string, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const RED_SUITS = new Set(["hearts", "diamonds"]);

export function Card({ card, faceDown = false, size = "md" }: CardProps) {
  const suitSymbol = SUIT_SYMBOLS[card.suit] ?? card.suit;
  const isRed = RED_SUITS.has(card.suit);
  const suitColor = isRed ? colors.cardRed : colors.cardBlack;

  if (faceDown) {
    return <View style={[styles.card, styles[`size_${size}`], styles.faceDown]} />;
  }

  return (
    <View style={[styles.card, styles[`size_${size}`]]}>
      <Text style={[styles.rank, styles[`rankSize_${size}`], { color: suitColor }]}>
        {card.rank}
      </Text>
      <Text style={[styles.suit, styles[`suitSize_${size}`], { color: suitColor }]}>
        {suitSymbol}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  faceDown: {
    backgroundColor: colors.primary,
  },
  size_sm: { width: 32, height: 44 },
  size_md: { width: 48, height: 68 },
  size_lg: { width: 64, height: 90 },
  rank: {
    fontWeight: typography.fontWeights.bold,
    lineHeight: 20,
  },
  rankSize_sm: { fontSize: typography.fontSizes.xs },
  rankSize_md: { fontSize: typography.fontSizes.sm },
  rankSize_lg: { fontSize: typography.fontSizes.md },
  suit: {
    lineHeight: 16,
  },
  suitSize_sm: { fontSize: typography.fontSizes.xs },
  suitSize_md: { fontSize: typography.fontSizes.sm },
  suitSize_lg: { fontSize: typography.fontSizes.md },
});
