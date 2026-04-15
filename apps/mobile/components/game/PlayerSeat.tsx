/**
 * PlayerSeat — compact seat card shown around the table for each player.
 *
 * Renders the opponent's name, chip count, visible cards, current bet,
 * status overlay (Folded / All-In), and active-player glow ring.
 * The dealer-button indicator is rendered by the parent (GameTable) to allow
 * free positioning of the "D" chip independent of seat size.
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { CardView } from "./CardView";
import type { Card } from "../../types/poker";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlayerSeatProps {
  playerId: string;
  username: string;
  chips: number;
  cards: Card[];
  currentBet: number;
  isActive: boolean;
  isFolded: boolean;
  isAllIn?: boolean;
  isDealer?: boolean;
  /** Label shown briefly after a player acts, e.g. "Call $20" */
  actionLabel?: string | null;
  /** Passed testID prefix — generates testID="seat-{playerId}" etc. */
  testID?: string;
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlayerSeat({
  playerId,
  username,
  chips,
  cards,
  currentBet,
  isActive,
  isFolded,
  isAllIn = false,
  isDealer = false,
  actionLabel,
  testID,
  style,
}: PlayerSeatProps) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const glowLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Pulse the glow ring while it's this player's turn.
  useEffect(() => {
    if (isActive && !isFolded) {
      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      glowLoop.current.start();
    } else {
      glowLoop.current?.stop();
      glowAnim.setValue(0);
    }
    return () => glowLoop.current?.stop();
  }, [isActive, isFolded, glowAnim]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <View
      style={[
        styles.seat,
        isActive && !isFolded && styles.seatActive,
        isFolded && styles.seatFolded,
        style,
      ]}
      testID={testID ?? `seat-${playerId}`}
    >
      {/* Active glow ring */}
      {isActive && !isFolded && (
        <Animated.View
          style={[styles.glowRing, { opacity: glowOpacity }]}
          testID={`glow-${playerId}`}
        />
      )}

      {/* Dealer button */}
      {isDealer && (
        <View style={styles.dealerChip} testID={`dealer-${playerId}`}>
          <Text style={styles.dealerText}>D</Text>
        </View>
      )}

      {/* Username */}
      <Text
        style={[styles.username, isFolded && styles.usernameGhost]}
        numberOfLines={1}
        testID={`username-${playerId}`}
      >
        {username}
      </Text>

      {/* Chips */}
      <Text style={styles.chips} testID={`chips-${playerId}`}>
        {`$${chips.toLocaleString()}`}
      </Text>

      {/* Cards */}
      <View style={styles.cardRow} testID={`cards-${playerId}`}>
        {cards.slice(0, 5).map((card, i) => (
          <CardView
            key={i}
            card={card}
            size="sm"
            testID={`seat-card-${playerId}-${i}`}
          />
        ))}
      </View>

      {/* Current bet */}
      {currentBet > 0 && (
        <Text style={styles.bet} testID={`bet-${playerId}`}>
          {`Bet $${currentBet}`}
        </Text>
      )}

      {/* Transient action label */}
      {actionLabel ? (
        <View style={styles.actionBadge} testID={`action-label-${playerId}`}>
          <Text style={styles.actionBadgeText}>{actionLabel}</Text>
        </View>
      ) : null}

      {/* Status overlay */}
      {isFolded && (
        <View style={styles.overlay} testID={`folded-${playerId}`} pointerEvents="none">
          <Text style={styles.overlayText}>FOLDED</Text>
        </View>
      )}
      {isAllIn && !isFolded && (
        <View style={[styles.overlay, styles.overlayAllIn]} testID={`allin-${playerId}`} pointerEvents="none">
          <Text style={styles.overlayText}>ALL IN</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  seat: {
    width: 120,
    minHeight: 110,
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    padding: 8,
    alignItems: "center",
    gap: 3,
    overflow: "hidden",
    position: "relative",
  },
  seatActive: {
    borderColor: "#ffd700",
    borderWidth: 2,
  },
  seatFolded: {
    opacity: 0.5,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffd700",
    backgroundColor: "transparent",
    zIndex: 1,
    pointerEvents: "none",
  },
  dealerChip: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ffd700",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  dealerText: {
    fontSize: 10,
    color: "#0a3d14",
    fontWeight: "900",
  },
  username: {
    fontSize: 12,
    color: "#e2e8f0",
    fontWeight: "700",
    maxWidth: "100%",
    textAlign: "center",
  },
  usernameGhost: {
    color: "#4a5568",
  },
  chips: {
    fontSize: 11,
    color: "#94a3b8",
  },
  cardRow: {
    flexDirection: "row",
    gap: 2,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  bet: {
    fontSize: 10,
    color: "#ffd700",
    fontWeight: "600",
  },
  actionBadge: {
    backgroundColor: "#0d2a14",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#22c55e",
    marginTop: 2,
  },
  actionBadgeText: {
    fontSize: 10,
    color: "#22c55e",
    fontWeight: "700",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  overlayAllIn: {
    backgroundColor: "rgba(100,0,0,0.45)",
  },
  overlayText: {
    fontSize: 11,
    color: "#f8fafc",
    fontWeight: "900",
    letterSpacing: 1,
  },
});
