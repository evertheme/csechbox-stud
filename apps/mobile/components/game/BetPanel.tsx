import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BetPanelProps {
  /** Minimum legal bet/raise amount */
  minBet: number;
  /** Maximum (player's chip stack) */
  maxBet: number;
  pot: number;
  /** True when there's already a bet to raise over; false for an opening bet */
  isRaise: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BetPanel({
  minBet,
  maxBet,
  pot,
  isRaise,
  onConfirm,
  onCancel,
}: BetPanelProps) {
  const [rawInput, setRawInput] = useState(String(minBet));

  const parsed = parseInt(rawInput, 10);
  const amount = isNaN(parsed) ? 0 : parsed;
  const isValid = amount >= minBet && amount <= maxBet;

  const setPreset = (value: number) => setRawInput(String(value));

  // Build preset buttons, deduplicating identical values.
  const presets: { label: string; value: number }[] = [];
  const seen = new Set<number>();
  const candidates = [
    { label: "Min", value: minBet },
    { label: "½ Pot", value: Math.max(minBet, Math.floor(pot / 2)) },
    { label: "Pot", value: Math.max(minBet, pot) },
    { label: "All-in", value: maxBet },
  ];
  for (const c of candidates) {
    if (c.value <= maxBet && !seen.has(c.value)) {
      presets.push(c);
      seen.add(c.value);
    }
  }

  const handleConfirm = () => {
    if (isValid) onConfirm(amount);
  };

  return (
    <View style={styles.panel} testID="bet-panel">
      <Text style={styles.title}>{isRaise ? "Raise to" : "Bet"}</Text>

      {/* Preset buttons */}
      <View style={styles.presetRow}>
        {presets.map((p) => (
          <Pressable
            key={p.label}
            style={[
              styles.presetBtn,
              amount === p.value && styles.presetBtnActive,
            ]}
            onPress={() => setPreset(p.value)}
            testID={`preset-${p.label.toLowerCase().replace(/[^a-z]/g, "")}`}
          >
            <Text
              style={[
                styles.presetText,
                amount === p.value && styles.presetTextActive,
              ]}
            >
              {p.label}
            </Text>
            <Text
              style={[
                styles.presetAmount,
                amount === p.value && styles.presetTextActive,
              ]}
            >
              ${p.value}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Amount input */}
      <View style={styles.inputRow}>
        <Text style={styles.dollarSign}>$</Text>
        <TextInput
          style={[styles.input, !isValid && rawInput !== "" && styles.inputError]}
          value={rawInput}
          onChangeText={setRawInput}
          keyboardType="number-pad"
          selectTextOnFocus
          testID="input-bet-amount"
        />
      </View>

      {/* Range hint */}
      <Text style={styles.hint} testID="bet-hint">
        Min: ${minBet} · Max: ${maxBet}
      </Text>

      {/* Confirm / Cancel */}
      <View style={styles.actionRow}>
        <Pressable
          style={styles.cancelBtn}
          onPress={onCancel}
          testID="bet-cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.confirmBtn, !isValid && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!isValid}
          accessibilityState={{ disabled: !isValid }}
          testID="bet-confirm"
        >
          <Text style={styles.confirmText}>
            {isRaise ? "Raise" : "Bet"} ${isValid ? amount : "—"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#16213e",
    borderTopWidth: 1,
    borderTopColor: "#2d3a56",
    padding: 16,
    gap: 12,
  },
  title: {
    color: "#fcd34d",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  presetRow: { flexDirection: "row", gap: 8 },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2d3a56",
    alignItems: "center",
    gap: 1,
  },
  presetBtnActive: { borderColor: "#fcd34d", backgroundColor: "#1c1a07" },
  presetText: { fontSize: 10, color: "#64748b", fontWeight: "600" },
  presetAmount: { fontSize: 12, color: "#94a3b8", fontWeight: "700" },
  presetTextActive: { color: "#fcd34d" },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#0f172a",
  },
  dollarSign: { color: "#64748b", fontSize: 18, marginRight: 4 },
  input: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 22,
    fontWeight: "700",
    paddingVertical: 10,
  },
  inputError: { color: "#f87171" },

  hint: { fontSize: 11, color: "#4a5568", textAlign: "center" },

  actionRow: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3a56",
    alignItems: "center",
  },
  cancelText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  confirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#fcd34d",
    alignItems: "center",
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: { color: "#1c1007", fontSize: 14, fontWeight: "700" },
});
