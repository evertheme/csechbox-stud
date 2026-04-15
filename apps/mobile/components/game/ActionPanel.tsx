/**
 * ActionPanel — fold / check / call / raise buttons with a turn-timer.
 *
 * Timer behaviour
 * ───────────────
 * When `isMyTurn` transitions to true, a countdown begins from `timerSeconds`
 * (default 30).  The bar fills red as time runs out.  At 0, `onTimeout()` is
 * called (if provided) — the parent should send an auto-fold.  The timer resets
 * whenever `isMyTurn` changes.
 *
 * Visibility rules
 * ────────────────
 * • Check button   — shown only when `canCheck === true`
 * • Call button    — shown only when `canCall === true`
 * • Raise/Bet btn  — shown only when `canRaise === true`
 * • All buttons    — disabled (`accessibilityState.disabled`) when `!isMyTurn`
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ActionPanelProps {
  isMyTurn: boolean;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  callAmount: number;
  /** Countdown length in seconds (default 30). */
  timerSeconds?: number;
  /** Called when the timer reaches 0 — parent should auto-fold. */
  onTimeout?: () => void;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  /** Opens the raise/bet amount panel. */
  onOpenRaise: () => void;
  isRaise?: boolean;
  testID?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const TIMER_DEFAULT = 30;
const WARNING_THRESHOLD = 10; // seconds remaining at which bar turns red

export function ActionPanel({
  isMyTurn,
  canCheck,
  canCall,
  canRaise,
  callAmount,
  timerSeconds = TIMER_DEFAULT,
  onTimeout,
  onFold,
  onCheck,
  onCall,
  onOpenRaise,
  isRaise = false,
  testID,
}: ActionPanelProps) {
  const [secondsLeft, setSecondsLeft] = useState(timerSeconds);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const barWidth   = useRef(new Animated.Value(1)).current; // 1 = full, 0 = empty
  const animRef    = useRef<Animated.CompositeAnimation | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    animRef.current?.stop();
  }, []);

  // Start / stop the countdown whenever `isMyTurn` changes.
  useEffect(() => {
    if (!isMyTurn) {
      clearTimer();
      setSecondsLeft(timerSeconds);
      barWidth.setValue(1);
      return;
    }

    // Reset to full.
    setSecondsLeft(timerSeconds);
    barWidth.setValue(1);

    // Animate the bar over `timerSeconds` seconds.
    animRef.current = Animated.timing(barWidth, {
      toValue: 0,
      duration: timerSeconds * 1000,
      useNativeDriver: false, // width animation can't use native driver
    });
    animRef.current.start();

    // Tick the seconds counter.
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) {
          clearTimer();
          onTimeout?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return clearTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn]);

  const isWarning = secondsLeft <= WARNING_THRESHOLD && isMyTurn;

  const barColor = barWidth.interpolate({
    inputRange: [0, 0.33, 1],
    outputRange: ["#ef4444", "#f97316", "#22c55e"],
  });

  const disabled = !isMyTurn;

  return (
    <View style={styles.container} testID={testID ?? "action-panel"}>
      {/* Turn-timer bar */}
      {isMyTurn && (
        <View style={styles.timerTrack} testID="timer-track">
          <Animated.View
            style={[
              styles.timerBar,
              {
                flex: barWidth,
                backgroundColor: barColor,
              },
            ]}
            testID="timer-bar"
          />
          <Text
            style={[styles.timerText, isWarning && styles.timerTextWarning]}
            testID="timer-seconds"
          >
            {`${secondsLeft}s`}
          </Text>
        </View>
      )}

      {/* Your turn label */}
      {isMyTurn && (
        <Text style={styles.yourTurnLabel} testID="your-turn-label">
          ⏰ Your Turn
        </Text>
      )}

      {/* Action buttons */}
      <View style={styles.buttonsRow}>
        {/* Fold */}
        <Pressable
          style={[styles.btn, styles.btnFold, disabled && styles.btnDisabled]}
          onPress={onFold}
          disabled={disabled}
          accessibilityState={{ disabled }}
          testID="btn-fold"
        >
          <Text style={styles.btnTextFold}>Fold</Text>
        </Pressable>

        {/* Check (shown when no outstanding bet) */}
        {canCheck && (
          <Pressable
            style={[styles.btn, styles.btnCheck, disabled && styles.btnDisabled]}
            onPress={onCheck}
            disabled={disabled}
            accessibilityState={{ disabled }}
            testID="btn-check"
          >
            <Text style={styles.btnTextCheck}>Check</Text>
          </Pressable>
        )}

        {/* Call (shown when there is a bet to call) */}
        {canCall && (
          <Pressable
            style={[styles.btn, styles.btnCall, disabled && styles.btnDisabled]}
            onPress={onCall}
            disabled={disabled}
            accessibilityState={{ disabled }}
            testID="btn-call"
          >
            <Text style={styles.btnTextCall}>
              {callAmount > 0 ? `Call $${callAmount}` : "Call"}
            </Text>
          </Pressable>
        )}

        {/* Raise / Bet */}
        {canRaise && (
          <Pressable
            style={[styles.btn, styles.btnRaise, disabled && styles.btnDisabled]}
            onPress={onOpenRaise}
            disabled={disabled}
            accessibilityState={{ disabled }}
            testID="btn-raise"
          >
            <Text style={styles.btnTextRaise}>
              {isRaise ? "Raise" : "Bet"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0d1b2e",
    borderTopWidth: 1,
    borderTopColor: "#2d3a56",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  timerTrack: {
    height: 6,
    backgroundColor: "#1e2a3e",
    borderRadius: 3,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
  },
  timerBar: {
    height: 6,
    borderRadius: 3,
  },
  timerText: {
    fontSize: 10,
    color: "#94a3b8",
    position: "absolute",
    right: 4,
    fontWeight: "700",
  },
  timerTextWarning: {
    color: "#ef4444",
  },
  yourTurnLabel: {
    fontSize: 12,
    color: "#ffd700",
    fontWeight: "700",
    textAlign: "center",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnFold: {
    backgroundColor: "#1e0f0f",
    borderWidth: 1.5,
    borderColor: "#7f1d1d",
  },
  btnTextFold: {
    fontSize: 14,
    color: "#f87171",
    fontWeight: "700",
  },
  btnCheck: {
    backgroundColor: "#0d2a1a",
    borderWidth: 1.5,
    borderColor: "#166534",
  },
  btnTextCheck: {
    fontSize: 14,
    color: "#22c55e",
    fontWeight: "700",
  },
  btnCall: {
    backgroundColor: "#0d2a1a",
    borderWidth: 1.5,
    borderColor: "#166534",
  },
  btnTextCall: {
    fontSize: 13,
    color: "#22c55e",
    fontWeight: "700",
  },
  btnRaise: {
    backgroundColor: "#ffd700",
  },
  btnTextRaise: {
    fontSize: 14,
    color: "#0a3d14",
    fontWeight: "800",
  },
});
