/**
 * RaiseSlider — raise / bet amount chooser.
 *
 * Provides four quick-bet presets (Min, ½ Pot, Pot, All-In) and a free-form
 * TextInput for manual entry.  The confirm button is disabled until the amount
 * falls within [minBet, maxBet].
 *
 * Because React Native's built-in Slider is not bundled in Expo and adding
 * @react-native-community/slider adds a native dep, we instead offer the
 * preset buttons plus a TextInput — a pattern familiar from online poker
 * clients, especially on mobile where dragging a slider is imprecise.
 */

import React, { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RaiseSliderProps {
  /** The minimum legal bet or raise amount. */
  minBet: number;
  /** The maximum legal amount (all-in: player's chip stack). */
  maxBet: number;
  /** The current total pot (used to compute ½-pot and pot presets). */
  pot: number;
  /** True when this is a raise over an existing bet; false for opening bet. */
  isRaise?: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
  testID?: string;
}

// ─── Preset buttons ───────────────────────────────────────────────────────────

interface Preset {
  label: string;
  value: (min: number, pot: number, max: number) => number;
}

const PRESETS: Preset[] = [
  { label: "Min",    value: (min) => min },
  { label: "½ Pot",  value: (min, pot, max) => Math.max(min, Math.min(Math.floor(pot / 2), max)) },
  { label: "Pot",    value: (min, pot, max) => Math.max(min, Math.min(pot, max)) },
  { label: "All-In", value: (_min, _pot, max) => max },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function RaiseSlider({
  minBet,
  maxBet,
  pot,
  isRaise = false,
  onConfirm,
  onCancel,
  testID,
}: RaiseSliderProps) {
  const [rawInput, setRawInput] = useState(String(minBet));

  const parsed   = parseInt(rawInput, 10);
  const amount   = isNaN(parsed) ? 0 : parsed;
  const isValid  = amount >= minBet && amount <= maxBet;

  const handlePreset = useCallback(
    (preset: Preset) => {
      const val = preset.value(minBet, pot, maxBet);
      setRawInput(String(val));
    },
    [minBet, pot, maxBet]
  );

  const handleConfirm = useCallback(() => {
    if (isValid) onConfirm(amount);
  }, [isValid, amount, onConfirm]);

  return (
    <View style={styles.container} testID={testID ?? "raise-slider"}>
      <Text style={styles.title}>
        {isRaise ? "Raise to" : "Bet Amount"}
      </Text>

      {/* Presets row */}
      <View style={styles.presetsRow}>
        {PRESETS.map((p) => {
          const val = p.value(minBet, pot, maxBet);
          const active = amount === val;
          return (
            <Pressable
              key={p.label}
              style={[styles.presetBtn, active && styles.presetBtnActive]}
              onPress={() => handlePreset(p)}
              testID={`preset-${p.label.toLowerCase().replace(" ", "-")}`}
            >
              <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                {p.label}
              </Text>
              <Text style={[styles.presetAmount, active && styles.presetAmountActive]}>
                ${val.toLocaleString()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Free-form input */}
      <View style={styles.inputRow}>
        <Text style={styles.dollarSign}>$</Text>
        <TextInput
          style={[styles.input, !isValid && rawInput.length > 0 && styles.inputInvalid]}
          value={rawInput}
          onChangeText={setRawInput}
          keyboardType="number-pad"
          selectTextOnFocus
          testID="input-raise-amount"
          accessibilityLabel="Raise amount"
        />
      </View>

      {/* Range hint */}
      <Text style={styles.hint}>
        Min ${minBet.toLocaleString()} · Max ${maxBet.toLocaleString()}
      </Text>

      {/* Action buttons */}
      <View style={styles.buttonsRow}>
        <Pressable style={styles.cancelBtn} onPress={onCancel} testID="btn-raise-cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.confirmBtn, !isValid && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!isValid}
          accessibilityState={{ disabled: !isValid }}
          testID="btn-raise-confirm"
        >
          <Text style={styles.confirmText}>
            {isRaise ? "Raise" : "Bet"}{isValid ? ` $${amount.toLocaleString()}` : ""}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#16213e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "#2d3a56",
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 14,
    color: "#e2e8f0",
    fontWeight: "700",
    textAlign: "center",
  },
  presetsRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    backgroundColor: "#0d1b2e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3a56",
    paddingVertical: 8,
    alignItems: "center",
  },
  presetBtnActive: {
    borderColor: "#ffd700",
    backgroundColor: "#1a2a14",
  },
  presetLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  presetLabelActive: { color: "#ffd700" },
  presetAmount: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    marginTop: 2,
  },
  presetAmountActive: { color: "#ffd700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d1b2e",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    paddingHorizontal: 12,
  },
  dollarSign: {
    fontSize: 18,
    color: "#ffd700",
    fontWeight: "700",
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 24,
    color: "#e2e8f0",
    fontWeight: "700",
    paddingVertical: 10,
  },
  inputInvalid: { color: "#f87171" },
  hint: {
    fontSize: 11,
    color: "#4a5568",
    textAlign: "center",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#4a5568",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    color: "#94a3b8",
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#ffd700",
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "#2d3a56",
  },
  confirmText: {
    fontSize: 15,
    color: "#0a3d14",
    fontWeight: "800",
  },
});
