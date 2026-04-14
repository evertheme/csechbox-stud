import React from "react";
import { View, StyleSheet } from "react-native";
import type { GameState } from "@poker/shared-types";
import { Card } from "./Card";
import { PlayerSeat } from "./PlayerSeat";
import { ChipStack } from "./ChipStack";
import { colors, borderRadius, spacing } from "../theme";

interface PokerTableProps {
  gameState: GameState;
  localPlayerId?: string;
}

export function PokerTable({ gameState, localPlayerId }: PokerTableProps) {
  const totalPot = gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);

  return (
    <View style={styles.container}>
      {/* Players arranged around table */}
      <View style={styles.playersRing}>
        {gameState.players.map((player, index) => (
          <View key={player.id} style={[styles.seatWrapper, getSeatPosition(index, gameState.players.length)]}>
            <PlayerSeat
              player={player}
              isCurrentTurn={index === gameState.currentPlayerIndex}
              showCards={player.id === localPlayerId}
            />
          </View>
        ))}
      </View>

      {/* Table felt */}
      <View style={styles.table}>
        {/* Community cards */}
        <View style={styles.communityCards}>
          {gameState.communityCards.map((card, i) => (
            <Card key={i} card={card} size="md" />
          ))}
          {/* Placeholder slots */}
          {Array.from({ length: Math.max(0, 5 - gameState.communityCards.length) }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.emptyCard} />
          ))}
        </View>

        {/* Pot */}
        {totalPot > 0 && <ChipStack amount={totalPot} label="Pot" />}
      </View>
    </View>
  );
}

function getSeatPosition(index: number, total: number): object {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const rx = 42;
  const ry = 35;
  const left = 50 + rx * Math.cos(angle);
  const top = 50 + ry * Math.sin(angle);
  return { position: "absolute", left: `${left}%`, top: `${top}%`, transform: [{ translateX: -50 }, { translateY: -50 }] };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    position: "relative",
  },
  playersRing: {
    ...StyleSheet.absoluteFillObject,
  },
  seatWrapper: {
    position: "absolute",
  },
  table: {
    position: "absolute",
    top: "25%",
    left: "15%",
    right: "15%",
    bottom: "25%",
    backgroundColor: colors.felt,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderWidth: 8,
    borderColor: colors.primaryDark,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  communityCards: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  emptyCard: {
    width: 48,
    height: 68,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderStyle: "dashed",
    opacity: 0.4,
  },
});
