/**
 * ChipAnimation — an animated poker chip that travels from one screen position
 * to another along a smooth Bézier arc.
 *
 * Motion model
 * ────────────
 * A single shared-value progress p ∈ [0, 1] drives both axes.  The XY path is
 * a quadratic Bézier curve whose control point is lifted above the midpoint
 * of the from→to segment so the chip follows a natural arc rather than a
 * straight line:
 *
 *   B(p) = (1-p)² · P0  +  2(1-p)p · Pc  +  p² · P1
 *
 * where P0 = from, P1 = to, Pc = midpoint + (0, -arcHeight).
 *
 * Chip colour tiers
 * ─────────────────
 *   $1 – $24   →  white  (low value)
 *   $25 – $99  →  red    (mid value)
 *   $100+      →  black  (high value)
 *
 * The chip is rendered with react-native-svg for crispness and stacked
 * 3 layers deep to simulate depth (a classic casino chip stack look).
 *
 * Usage
 * ─────
 *   <ChipAnimation
 *     amount={50}
 *     from={{ x: 200, y: 300 }}
 *     to={{ x: 100, y: 150 }}
 *     onComplete={() => console.log("chips moved!")}
 *   />
 *
 * The component renders with `position: "absolute"` so it should be placed
 * inside a container that covers the area between `from` and `to`.
 */

import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChipAnimationProps {
  /** Dollar amount displayed on the chip and used to pick the colour tier. */
  amount: number;
  /** Starting screen coordinate (absolute, relative to the parent container). */
  from: { x: number; y: number };
  /** Ending screen coordinate. */
  to: { x: number; y: number };
  /** Called once after the chip reaches its destination. */
  onComplete?: () => void;
  testID?: string;
}

// ─── Chip appearance ──────────────────────────────────────────────────────────

const CHIP_RADIUS = 20; // px — outer radius of a single chip disc
const CHIP_SIZE   = CHIP_RADIUS * 2;
const STACK_COUNT = 3;   // number of stacked shadow discs drawn below the top chip

interface ChipTheme {
  face:    string;
  rim:     string;
  text:    string;
  shadow:  string;
}

function chipTheme(amount: number): ChipTheme {
  if (amount >= 100) {
    return { face: "#1a1a1a", rim: "#555", text: "#f5f5f5", shadow: "#000" };
  }
  if (amount >= 25) {
    return { face: "#c0392b", rim: "#922b21", text: "#fff",   shadow: "#7b241c" };
  }
  return   { face: "#f5f5f0", rim: "#bdbdbd", text: "#1a1a1a", shadow: "#9e9e9e" };
}

// ─── Label helper ─────────────────────────────────────────────────────────────

function chipLabel(amount: number): string {
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${amount}`;
}

// ─── Chip SVG ─────────────────────────────────────────────────────────────────

interface ChipSvgProps {
  amount: number;
  labelTestID?: string;
}

function ChipSvg({ amount, labelTestID }: ChipSvgProps) {
  const theme    = chipTheme(amount);
  const cx       = CHIP_RADIUS;
  const cy       = CHIP_RADIUS;
  const r        = CHIP_RADIUS;
  const rimWidth = 4;
  const innerR   = r - rimWidth;
  const label    = chipLabel(amount);
  const fontSize = amount >= 1000 ? 7 : 8;

  return (
    <Svg width={CHIP_SIZE} height={CHIP_SIZE} viewBox={`0 0 ${CHIP_SIZE} ${CHIP_SIZE}`}>
      <Defs>
        {/* Subtle radial gradient for depth */}
        <RadialGradient
          id="chip-grad"
          cx="38%"
          cy="35%"
          r="65%"
          fx="38%"
          fy="35%"
        >
          <Stop offset="0%"   stopColor="#fff" stopOpacity={0.22} />
          <Stop offset="100%" stopColor="#000" stopOpacity={0.12} />
        </RadialGradient>
      </Defs>

      {/* ── Stack shadow discs ──────────────────────────── */}
      {Array.from({ length: STACK_COUNT }).map((_, i) => {
        const offset = (STACK_COUNT - i) * 1.5;
        return (
          <Circle
            key={i}
            cx={cx + 0.5}
            cy={cy + offset}
            r={r - 0.5}
            fill={theme.shadow}
            opacity={0.35 - i * 0.08}
          />
        );
      })}

      {/* ── Chip body ───────────────────────────────────── */}

      {/* Outer rim */}
      <Circle cx={cx} cy={cy} r={r} fill={theme.rim} />

      {/* Face */}
      <Circle cx={cx} cy={cy} r={innerR} fill={theme.face} />

      {/* Edge notch pattern (8 marks around the rim) */}
      <G>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle   = (i / 8) * Math.PI * 2;
          const notchR  = r - 1.5;
          const nx      = cx + Math.cos(angle) * notchR;
          const ny      = cy + Math.sin(angle) * notchR;
          return (
            <Circle
              key={i}
              cx={nx}
              cy={ny}
              r={2}
              fill={theme.face}
              opacity={0.7}
            />
          );
        })}
      </G>

      {/* Inner ring line */}
      <Circle
        cx={cx}
        cy={cy}
        r={innerR * 0.72}
        fill="none"
        stroke={theme.rim}
        strokeWidth={1}
        opacity={0.5}
      />

      {/* Gradient sheen overlay */}
      <Circle cx={cx} cy={cy} r={innerR} fill="url(#chip-grad)" />

      {/* Amount label */}
      <SvgText
        x={cx}
        y={cy + fontSize * 0.38}
        fontSize={fontSize}
        fontWeight="700"
        fill={theme.text}
        textAnchor="middle"
        testID={labelTestID}
      >
        {label}
      </SvgText>
    </Svg>
  );
}

// ─── Bézier helpers (run on JS thread) ───────────────────────────────────────

/**
 * Evaluate a quadratic Bézier at parameter t.
 * P0 → start, Pc → control, P1 → end.
 */
function bezier(p0: number, pc: number, p1: number, t: number): number {
  "worklet";
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * pc + t * t * p1;
}

// ─── ChipAnimation ────────────────────────────────────────────────────────────

export function ChipAnimation({
  amount,
  from,
  to,
  onComplete,
  testID,
}: ChipAnimationProps) {
  const progress = useSharedValue(0);

  // Bézier control point — lifted above the midpoint to create the arc.
  // arcHeight scales with the distance so short and long trips feel natural.
  const dx         = to.x - from.x;
  const dy         = to.y - from.y;
  const dist       = Math.sqrt(dx * dx + dy * dy);
  const arcHeight  = Math.max(60, dist * 0.35);
  const pcx        = (from.x + to.x) / 2;
  const pcy        = (from.y + to.y) / 2 - arcHeight;

  // Animated position derived from the single shared progress value.
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const x = bezier(from.x, pcx, to.x, p) - CHIP_RADIUS;
    const y = bezier(from.y, pcy, to.y, p) - CHIP_RADIUS;
    // Slight scale-up at the apex (p≈0.5) for a natural "tossed chip" feel.
    const scale = 1 + 0.18 * Math.sin(p * Math.PI);
    return {
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    };
  });

  // Launch the animation once on mount.
  useEffect(() => {
    progress.value = withTiming(
      1,
      {
        duration: 600,
        easing: Easing.out(Easing.quad),
      },
      (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      },
    );
    // progress is a shared value ref — no need to list in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedTestID = testID ?? "chip-animation";

  return (
    <Animated.View
      style={[styles.chip, animatedStyle]}
      testID={resolvedTestID}
      accessibilityLabel={chipLabel(amount)}
      pointerEvents="none"
    >
      <ChipSvg amount={amount} labelTestID={`${resolvedTestID}-label`} />
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  chip: {
    position: "absolute",
    // Starts at (0,0); the animated transform positions it correctly.
    top:  0,
    left: 0,
    width:  CHIP_SIZE,
    height: CHIP_SIZE,
  },
});
