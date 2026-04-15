/**
 * Card — a crisp SVG-rendered playing card component.
 *
 * Three visual states
 * ───────────────────
 * 1. card === null        → empty slot (dashed outline, translucent)
 * 2. faceUp === false     → card back (geometric diamond-lattice + chip medallion)
 * 3. faceUp === true      → card face (rank corners + centred suit glyph)
 *
 * Press behaviour
 * ───────────────
 * When `onPress` is supplied the card gains a spring scale animation on
 * press-in / press-out.  Without `onPress` the card is purely decorative.
 *
 * Highlighted
 * ───────────
 * A gold halo border is drawn around the card when `highlighted === true`,
 * used to indicate winning-hand cards during showdown.
 *
 * Sizes (width × height)
 * ───────────────────────
 * small  → 40 × 60 px
 * medium → 60 × 90 px   (default)
 * large  → 80 × 120 px
 */

import React, { useCallback, useRef } from "react";
import { Animated, Pressable, StyleSheet, type ViewStyle } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Pattern,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import type { Suit } from "../../types/poker";

// Workaround: shared-types Card does not carry `faceUp`; callers pass it as a
// separate prop so the component is usable with both card shapes.
export interface CardData {
  rank: string;
  suit: Suit;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CardProps {
  /** The card to display, or `null` for an empty placeholder slot. */
  card: CardData | null;
  /** Whether to show the card face (true) or the back design (false). */
  faceUp?: boolean;
  size?: "small" | "medium" | "large";
  /** Draws a gold highlight border — use for winning hand cards at showdown. */
  highlighted?: boolean;
  /** Extra styles applied to the outer container (for layout positioning). */
  style?: ViewStyle;
  /** When provided the card becomes pressable with a spring scale animation. */
  onPress?: () => void;
  testID?: string;
}

// ─── Dimension table ──────────────────────────────────────────────────────────

const DIMS = {
  small:  { w: 40,  h: 60,  r: 4,  rankFs: 8,  suitFs: 11, centerFs: 20 },
  medium: { w: 60,  h: 90,  r: 6,  rankFs: 11, suitFs: 14, centerFs: 30 },
  large:  { w: 80,  h: 120, r: 8,  rankFs: 14, suitFs: 18, centerFs: 40 },
} as const;

// ─── Colour constants ─────────────────────────────────────────────────────────

const SUIT_COLOUR: Record<Suit, string> = {
  hearts:   "#dc2626",
  diamonds: "#dc2626",
  spades:   "#0f172a",
  clubs:    "#0f172a",
};

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts:   "♥",
  diamonds: "♦",
  spades:   "♠",
  clubs:    "♣",
};

// Back-design palette
const BACK_BG       = "#0d2137";
const BACK_GRID     = "#163252";
const BACK_BORDER   = "#ffd700";
const BACK_CHIP_RIM = "#c9a227";

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Empty placeholder — dashed rounded rectangle */
function EmptySlot({ w, h, r }: { w: number; h: number; r: number }) {
  return (
    <Rect
      x={1}
      y={1}
      width={w - 2}
      height={h - 2}
      rx={r}
      ry={r}
      fill="rgba(255,255,255,0.04)"
      stroke="#334155"
      strokeWidth={1.5}
      strokeDasharray="4 3"
    />
  );
}

/**
 * Card back — diamond lattice background + concentric poker-chip medallion.
 *
 *  ┌──────────────────┐
 *  │ ╱╲╱╲╱╲╱╲╱╲╱╲╱╲ │  ← diagonal grid (SVG pattern)
 *  │╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲│
 *  │   ┌──────────┐   │  ← gold inner border
 *  │   │   ( )    │   │  ← chip medallion
 *  │   └──────────┘   │
 *  │╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱│
 *  └──────────────────┘
 */
function CardBack({ w, h, r }: { w: number; h: number; r: number }) {
  const cx   = w / 2;
  const cy   = h / 2;
  // Chip radius: ~22 % of the shorter dimension
  const chipR = Math.round(Math.min(w, h) * 0.22);
  // Inner border inset
  const inset = Math.round(Math.min(w, h) * 0.07);
  // Cell size for the diamond grid pattern
  const cell = Math.round(Math.min(w, h) * 0.18);

  return (
    <G>
      {/* Background fill */}
      <Rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill={BACK_BG} />

      {/* Diamond lattice pattern */}
      <Defs>
        <Pattern
          id="diamond-grid"
          x={0}
          y={0}
          width={cell}
          height={cell}
          patternUnits="userSpaceOnUse"
        >
          {/* Two diagonal lines per cell create the grid */}
          <Line
            x1={0}
            y1={0}
            x2={cell}
            y2={cell}
            stroke={BACK_GRID}
            strokeWidth={0.8}
          />
          <Line
            x1={cell}
            y1={0}
            x2={0}
            y2={cell}
            stroke={BACK_GRID}
            strokeWidth={0.8}
          />
        </Pattern>
      </Defs>

      {/* Clip the pattern to the card shape */}
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={r}
        ry={r}
        fill="url(#diamond-grid)"
      />

      {/* Gold inner border */}
      <Rect
        x={inset}
        y={inset}
        width={w - inset * 2}
        height={h - inset * 2}
        rx={r - 1}
        ry={r - 1}
        fill="none"
        stroke={BACK_BORDER}
        strokeWidth={1}
        opacity={0.8}
      />

      {/* ── Chip medallion ─────────────────────────────── */}

      {/* Outer dark ring */}
      <Circle cx={cx} cy={cy} r={chipR} fill={BACK_BG} stroke={BACK_CHIP_RIM} strokeWidth={1.5} />

      {/* Middle coloured sectors (4 quadrants alternating) */}
      {[0, 90, 180, 270].map((angle, i) => {
        const rad   = (angle * Math.PI) / 180;
        const rad90 = ((angle + 90) * Math.PI) / 180;
        const r1    = chipR * 0.62;
        const x1    = cx + Math.cos(rad)   * r1;
        const y1    = cy + Math.sin(rad)   * r1;
        const x2    = cx + Math.cos(rad90) * r1;
        const y2    = cy + Math.sin(rad90) * r1;
        // Alternate navy / gold sectors
        const fill = i % 2 === 0 ? "#1a4a7a" : "#b8860b";
        return (
          <Path
            key={angle}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r1} ${r1} 0 0 1 ${x2} ${y2} Z`}
            fill={fill}
            opacity={0.9}
          />
        );
      })}

      {/* Inner white circle */}
      <Circle cx={cx} cy={cy} r={chipR * 0.42} fill="#f0f4f8" />

      {/* Centre dot */}
      <Circle cx={cx} cy={cy} r={chipR * 0.12} fill={BACK_BG} />

      {/* 4 tick marks around the rim */}
      {[0, 90, 180, 270].map((angle) => {
        const rad  = (angle * Math.PI) / 180;
        const r0   = chipR * 0.7;
        const r1   = chipR * 0.88;
        return (
          <Line
            key={angle}
            x1={cx + Math.cos(rad) * r0}
            y1={cy + Math.sin(rad) * r0}
            x2={cx + Math.cos(rad) * r1}
            y2={cy + Math.sin(rad) * r1}
            stroke={BACK_BORDER}
            strokeWidth={1.5}
          />
        );
      })}
    </G>
  );
}

/** The face of a standard playing card */
function CardFace({
  w, h, r,
  rank, suit,
  rankFs, suitFs, centerFs,
}: {
  w: number; h: number; r: number;
  rank: string; suit: Suit;
  rankFs: number; suitFs: number; centerFs: number;
}) {
  const color     = SUIT_COLOUR[suit];
  const symbol    = SUIT_SYMBOL[suit];
  const cx        = w / 2;
  const cy        = h / 2;

  // Corner anchor offsets
  const padX      = Math.round(w * 0.12);
  const topRankY  = Math.round(h * 0.14);
  const topSuitY  = Math.round(h * 0.25);
  const botRankY  = Math.round(h - h * 0.06);
  const botSuitY  = Math.round(h - h * 0.16);

  return (
    <G>
      {/* White card background */}
      <Rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill="#f8fafc" />

      {/* ── Top-left corner ───────────────────────────── */}
      <SvgText
        x={padX}
        y={topRankY}
        fontSize={rankFs}
        fontWeight="800"
        fill={color}
        textAnchor="middle"
      >
        {rank}
      </SvgText>
      <SvgText
        x={padX}
        y={topSuitY}
        fontSize={suitFs}
        fill={color}
        textAnchor="middle"
      >
        {symbol}
      </SvgText>

      {/* ── Centre suit glyph ──────────────────────────── */}
      <SvgText
        x={cx}
        y={cy + centerFs * 0.38}
        fontSize={centerFs}
        fill={color}
        textAnchor="middle"
      >
        {symbol}
      </SvgText>

      {/* ── Bottom-right corner (rotated 180°) ─────────── */}
      <G rotation={180} origin={`${w / 2}, ${h / 2}`}>
        <SvgText
          x={padX}
          y={topRankY}
          fontSize={rankFs}
          fontWeight="800"
          fill={color}
          textAnchor="middle"
        >
          {rank}
        </SvgText>
        <SvgText
          x={padX}
          y={topSuitY}
          fontSize={suitFs}
          fill={color}
          textAnchor="middle"
        >
          {symbol}
        </SvgText>
      </G>
    </G>
  );
}

/** Gold halo highlight border drawn on top of everything */
function HighlightBorder({ w, h, r }: { w: number; h: number; r: number }) {
  return (
    <Rect
      x={0.5}
      y={0.5}
      width={w - 1}
      height={h - 1}
      rx={r}
      ry={r}
      fill="none"
      stroke="#ffd700"
      strokeWidth={2.5}
      opacity={0.9}
    />
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  card,
  faceUp    = false,
  size      = "medium",
  highlighted = false,
  style,
  onPress,
  testID,
}: CardProps) {
  const dim  = DIMS[size];
  const { w, h, r, rankFs, suitFs, centerFs } = dim;

  // ── Press animation ────────────────────────────────────────────────────────

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.93,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // ── Inner SVG content ──────────────────────────────────────────────────────

  let svgContent: React.ReactNode;

  if (card === null) {
    // Empty placeholder slot
    svgContent = <EmptySlot w={w} h={h} r={r} />;
  } else if (!faceUp) {
    // Face-down back
    svgContent = <CardBack w={w} h={h} r={r} />;
  } else {
    // Face-up
    svgContent = (
      <CardFace
        w={w} h={h} r={r}
        rank={card.rank}
        suit={card.suit}
        rankFs={rankFs}
        suitFs={suitFs}
        centerFs={centerFs}
      />
    );
  }

  // ── Container ──────────────────────────────────────────────────────────────

  const testId = testID ?? (
    card === null        ? "card-empty"
    : !faceUp            ? "card-back"
    : `card-${card.rank}-${card.suit}`
  );

  const inner = (
    <Animated.View
      style={[
        styles.shadow,
        {
          width:  w,
          height: h,
          transform: [{ scale: scaleAnim }],
        },
        style,
      ]}
      testID={testId}
    >
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {svgContent}
        {highlighted && <HighlightBorder w={w} h={h} r={r} />}
      </Svg>
    </Animated.View>
  );

  // Wrap in Pressable only when interactive
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        testID={`${testId}-btn`}
      >
        {inner}
      </Pressable>
    );
  }

  return inner;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  shadow: {
    // Native shadow (iOS)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    // Android
    elevation: 4,
  },
});
