import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { PlayerPublic, Card as CardType } from "@csechbox/shared-types";
import { Card } from "./Card";
import { ChipStack } from "./ChipStack";
import { colors, borderRadius, spacing, typography } from "../theme";

interface PlayerSeatProps {
  player: PlayerPublic;
  holeCards?: CardType[];
  isCurrentTurn?: boolean;
  showCards?: boolean;
}

export function PlayerSeat({ player, holeCards, isCurrentTurn = false, showCards = false }: PlayerSeatProps) {
  const isFolded = player.status === "folded";

  return (
    <View style={[styles.container, isCurrentTurn && styles.activeTurn, isFolded && styles.folded]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{player.username.charAt(0).toUpperCase()}</Text>
      </View>

      <View style={styles.info}>
        <Text style={styles.username} numberOfLines={1}>{player.username}</Text>
        <ChipStack amount={player.chipCount} />
        {player.isDealer && <Text style={styles.badge}>D</Text>}
        {player.isSmallBlind && <Text style={styles.badge}>SB</Text>}
        {player.isBigBlind && <Text style={styles.badge}>BB</Text>}
      </View>

      {player.hasHoleCards && (
        <View style={styles.cards}>
          {holeCards && showCards
            ? holeCards.map((card, i) => <Card key={i} card={card} size="sm" />)
            : [0, 1].map((i) => (
                <View key={i} style={styles.cardBack} />
              ))}
        </View>
      )}

      {player.currentBet > 0 && (
        <ChipStack amount={player.currentBet} label="bet" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    alignItems: "center",
    width: 100,
    borderWidth: 2,
    borderColor: "transparent",
  },
  activeTurn: {
    borderColor: colors.accent,
  },
  folded: {
    opacity: 0.4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.text,
    fontWeight: typography.fontWeights.bold,
    fontSize: typography.fontSizes.md,
  },
  info: {
    alignItems: "center",
    marginTop: spacing.xs,
  },
  username: {
    color: colors.text,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    maxWidth: 80,
  },
  badge: {
    color: colors.accent,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
  },
  cards: {
    flexDirection: "row",
    gap: 2,
    marginTop: spacing.xs,
  },
  cardBack: {
    width: 24,
    height: 34,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
});
