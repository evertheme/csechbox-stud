import { Platform, StyleSheet, Text, View } from "react-native";
import type { Card, Suit } from "../../types/poker";

// ─── Constants ────────────────────────────────────────────────────────────────

const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const RED_SUITS: Suit[] = ["hearts", "diamonds"];

// ─── Props ────────────────────────────────────────────────────────────────────

export type CardSize = "sm" | "md" | "lg";

interface CardViewProps {
  card: Card;
  size?: CardSize;
  testID?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CardView({ card, size = "md", testID }: CardViewProps) {
  const sizeStyle = SIZE_STYLES[size];

  if (!card.faceUp) {
    return (
      <View
        style={[styles.card, sizeStyle, styles.cardBack]}
        testID={testID ?? "card-back"}
      >
        <Text style={[styles.backPattern, FONT_SIZES[size]]}>🂠</Text>
      </View>
    );
  }

  const isRed = RED_SUITS.includes(card.suit);
  const suit = SUIT_SYMBOL[card.suit];

  return (
    <View
      style={[styles.card, sizeStyle]}
      testID={testID ?? `card-${card.rank}${suit}`}
    >
      <Text style={[styles.rankTop, FONT_SIZES[size], isRed && styles.textRed]}>
        {card.rank}
      </Text>
      <Text style={[styles.suitCenter, SUIT_FONT_SIZES[size], isRed && styles.textRed]}>
        {suit}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SIZE_STYLES = {
  sm: { width: 34, height: 48, borderRadius: 5 },
  md: { width: 46, height: 64, borderRadius: 7 },
  lg: { width: 62, height: 88, borderRadius: 9 },
} as const;

const FONT_SIZES = {
  sm: { fontSize: 10 },
  md: { fontSize: 13 },
  lg: { fontSize: 17 },
} as const;

const SUIT_FONT_SIZES = {
  sm: { fontSize: 14 },
  md: { fontSize: 20 },
  lg: { fontSize: 28 },
} as const;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    ...Platform.select({
      web:     { boxShadow: "0 1px 2px rgba(0,0,0,0.18)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.18,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  cardBack: {
    backgroundColor: "#1e3a5f",
    borderColor: "#2d5a8e",
  },
  backPattern: {
    color: "#ffd700",
  },
  rankTop: {
    color: "#0f172a",
    fontWeight: "700",
    lineHeight: 16,
  },
  suitCenter: {
    color: "#0f172a",
    lineHeight: 24,
  },
  textRed: { color: "#dc2626" },
});
