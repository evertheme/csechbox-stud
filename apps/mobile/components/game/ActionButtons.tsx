import { Pressable, StyleSheet, Text, View } from "react-native";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ActionButtonsProps {
  isMyTurn: boolean;
  canCheck: boolean;
  /** Amount the current player needs to put in to call (0 when checking) */
  callAmount: number;
  /** True when the current player has already matched the current bet */
  hasBet: boolean;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  /** Called when the Bet / Raise button is pressed; opens the BetPanel */
  onOpenBetPanel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActionButtons({
  isMyTurn,
  canCheck,
  callAmount,
  onFold,
  onCheck,
  onCall,
  onOpenBetPanel,
}: ActionButtonsProps) {
  const disabled = !isMyTurn;

  return (
    <View style={styles.row}>
      {/* Fold */}
      <Pressable
        style={[styles.btn, styles.foldBtn, disabled && styles.btnDisabled]}
        onPress={onFold}
        disabled={disabled}
        accessibilityState={{ disabled }}
        testID="btn-fold"
      >
        <Text style={styles.foldText}>Fold</Text>
      </Pressable>

      {/* Check / Call */}
      {canCheck ? (
        <Pressable
          style={[styles.btn, styles.checkBtn, disabled && styles.btnDisabled]}
          onPress={onCheck}
          disabled={disabled}
          accessibilityState={{ disabled }}
          testID="btn-check"
        >
          <Text style={styles.checkText}>Check</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.btn, styles.callBtn, disabled && styles.btnDisabled]}
          onPress={onCall}
          disabled={disabled}
          accessibilityState={{ disabled }}
          testID="btn-call"
        >
          <Text style={styles.callText}>
            Call {callAmount > 0 ? `$${callAmount}` : ""}
          </Text>
        </Pressable>
      )}

      {/* Bet / Raise */}
      <Pressable
        style={[styles.btn, styles.raiseBtn, disabled && styles.btnDisabled]}
        onPress={onOpenBetPanel}
        disabled={disabled}
        accessibilityState={{ disabled }}
        testID="btn-raise"
      >
        <Text style={styles.raiseText}>
          {callAmount > 0 ? "Raise" : "Bet"}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },

  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1.5,
  },
  btnDisabled: { opacity: 0.35 },

  foldBtn: {
    borderColor: "#7f1d1d",
    backgroundColor: "#1e0f0f",
  },
  foldText: { color: "#f87171", fontSize: 14, fontWeight: "700" },

  checkBtn: {
    borderColor: "#1d4ed8",
    backgroundColor: "#0f1e3a",
  },
  checkText: { color: "#93c5fd", fontSize: 14, fontWeight: "700" },

  callBtn: {
    borderColor: "#15803d",
    backgroundColor: "#0a2410",
  },
  callText: { color: "#86efac", fontSize: 14, fontWeight: "700" },

  raiseBtn: {
    borderColor: "#854d0e",
    backgroundColor: "#1c1007",
  },
  raiseText: { color: "#fcd34d", fontSize: 14, fontWeight: "700" },
});
