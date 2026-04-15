import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { getSocket } from "../../lib/socket";
import { GAME_REGISTRY, STAKES_PRESETS } from "../../lib/gameRegistry";
import type {
  CreateRoomPayload,
  RoomCreatedPayload,
  StakesPreset,
} from "../../types/game";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PLAYERS_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;
const DEFAULT_MAX_PLAYERS = 6;
const DEFAULT_PRESET_IDX = 1; // $1/$2
const BUY_IN_DEFAULT_MULT = 100;
const BUY_IN_MIN_MULT = 20;
const ROOM_CREATE_TIMEOUT_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultBuyIn(bringIn: number, chips: number): number {
  return Math.min(Math.round(BUY_IN_DEFAULT_MULT * bringIn), chips);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Card({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

// ─── CreateGameScreen ─────────────────────────────────────────────────────────

export default function CreateGameScreen() {
  const { chips } = useAuthStore();

  // ── Form state ─────────────────────────────────────────────────────────────

  const [gameTypeId, setGameTypeId] = useState(GAME_REGISTRY[0].id);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [stakesMode, setStakesMode] = useState<"preset" | "custom">("preset");
  const [presetIdx, setPresetIdx] = useState(DEFAULT_PRESET_IDX);
  const [customAnte, setCustomAnte] = useState("");
  const [customBringIn, setCustomBringIn] = useState("");

  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);

  const [buyIn, setBuyIn] = useState(() =>
    String(defaultBuyIn(STAKES_PRESETS[DEFAULT_PRESET_IDX].bringIn, chips))
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Effective stakes (derived) ─────────────────────────────────────────────

  const effectiveStakes: StakesPreset =
    stakesMode === "preset"
      ? STAKES_PRESETS[presetIdx]
      : {
          label: "Custom",
          ante: parseFloat(customAnte) || 0,
          bringIn: parseFloat(customBringIn) || 0,
        };

  const minBuyIn = BUY_IN_MIN_MULT * effectiveStakes.bringIn;

  // ── Stake selection ────────────────────────────────────────────────────────

  const applyPreset = useCallback(
    (idx: number) => {
      setStakesMode("preset");
      setPresetIdx(idx);
      const newBuyIn = defaultBuyIn(STAKES_PRESETS[idx].bringIn, chips);
      if (newBuyIn > 0) setBuyIn(String(newBuyIn));
    },
    [chips]
  );

  const applyCustom = () => {
    setStakesMode("custom");
    // Don't auto-update buy-in yet; user hasn't finished entering custom stakes.
  };

  // Recalculate buy-in when custom bring-in is committed (on blur).
  const handleCustomBringInBlur = () => {
    const bi = parseFloat(customBringIn);
    if (!isNaN(bi) && bi > 0) {
      const newBuyIn = defaultBuyIn(bi, chips);
      if (newBuyIn > 0) setBuyIn(String(newBuyIn));
    }
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (stakesMode === "custom") {
      const ante = parseFloat(customAnte);
      const bi = parseFloat(customBringIn);
      if (isNaN(ante) || ante <= 0) return "Ante must be a positive number.";
      if (isNaN(bi) || bi <= 0) return "Bring-in must be a positive number.";
      if (bi <= ante) return "Bring-in must be greater than the ante.";
    }

    const buyInNum = parseFloat(buyIn);
    if (isNaN(buyInNum) || buyInNum <= 0) return "Buy-in must be a positive number.";
    if (effectiveStakes.bringIn > 0 && buyInNum < minBuyIn)
      return `Minimum buy-in for these stakes is $${minBuyIn.toFixed(2)}.`;
    if (buyInNum > chips)
      return `You only have $${chips.toLocaleString()} in chips.`;

    return null;
  };

  // ── Socket listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    const onRoomCreated = ({ roomId }: RoomCreatedPayload) => {
      clearTimeout(timeoutRef.current);
      setSubmitting(false);
      router.replace(`/(app)/game/${roomId}`);
    };

    const onCreateRoomError = (payload: { message?: string }) => {
      clearTimeout(timeoutRef.current);
      setSubmitting(false);
      setError(payload?.message ?? "Failed to create room. Please try again.");
    };

    socket.on("room-created", onRoomCreated);
    socket.on("create-room-error", onCreateRoomError);

    return () => {
      socket.off("room-created", onRoomCreated);
      socket.off("create-room-error", onCreateRoomError);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleCreate = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);

    const payload: CreateRoomPayload = {
      gameType: gameTypeId,
      stakes: {
        ante: effectiveStakes.ante,
        bringIn: effectiveStakes.bringIn,
      },
      maxPlayers,
      buyIn: parseFloat(buyIn),
    };

    getSocket().emit("create-room", payload);

    timeoutRef.current = setTimeout(() => {
      setSubmitting(false);
      setError("Server did not respond. Please try again.");
    }, ROOM_CREATE_TIMEOUT_MS);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen
        options={{ title: "Create Game", headerBackTitle: "Lobby" }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Game Type ───────────────────────────────────────────────────── */}
        <SectionLabel>Game Type</SectionLabel>
        <Card testID="game-type-card">
          {GAME_REGISTRY.map((variant, i) => {
            const selected = gameTypeId === variant.id;
            const expanded = expandedId === variant.id;
            return (
              <View key={variant.id} testID={`variant-row-${variant.id}`}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.variantRow}>
                  <Pressable
                    style={styles.variantSelectArea}
                    onPress={() => setGameTypeId(variant.id)}
                    testID={`variant-${variant.id}`}
                  >
                    <View
                      style={[styles.radio, selected && styles.radioSelected]}
                    >
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Text
                      style={[
                        styles.variantName,
                        selected && styles.variantNameSelected,
                      ]}
                      testID={`variant-name-${variant.id}`}
                    >
                      {variant.name}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.infoBtn}
                    onPress={() =>
                      setExpandedId(expanded ? null : variant.id)
                    }
                    testID={`info-btn-${variant.id}`}
                    hitSlop={10}
                  >
                    <Text style={styles.infoBtnText}>
                      {expanded ? "▲" : "▼"}
                    </Text>
                  </Pressable>
                </View>

                {expanded && (
                  <Text
                    style={styles.variantDesc}
                    testID={`desc-${variant.id}`}
                  >
                    {variant.description}
                  </Text>
                )}
              </View>
            );
          })}
        </Card>

        {/* ── Stakes ──────────────────────────────────────────────────────── */}
        <SectionLabel>Stakes</SectionLabel>
        <View style={styles.stakesGrid} testID="stakes-grid">
          {STAKES_PRESETS.map((preset, idx) => {
            const active = stakesMode === "preset" && presetIdx === idx;
            return (
              <Pressable
                key={preset.label}
                style={[styles.stakeBtn, active && styles.stakeBtnActive]}
                onPress={() => applyPreset(idx)}
                testID={`stake-preset-${idx}`}
              >
                <Text
                  style={[
                    styles.stakeBtnText,
                    active && styles.stakeBtnTextActive,
                  ]}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[
              styles.stakeBtn,
              stakesMode === "custom" && styles.stakeBtnActive,
            ]}
            onPress={applyCustom}
            testID="stake-custom"
          >
            <Text
              style={[
                styles.stakeBtnText,
                stakesMode === "custom" && styles.stakeBtnTextActive,
              ]}
            >
              Custom
            </Text>
          </Pressable>
        </View>

        {stakesMode === "custom" && (
          <View style={styles.customRow} testID="custom-stakes-inputs">
            <View style={styles.customField}>
              <Text style={styles.inputLabel}>Ante ($)</Text>
              <TextInput
                style={styles.input}
                value={customAnte}
                onChangeText={(v) => {
                  setCustomAnte(v);
                  setError(null);
                }}
                placeholder="0.00"
                placeholderTextColor="#4a5568"
                keyboardType="decimal-pad"
                testID="input-ante"
              />
            </View>
            <View style={styles.customField}>
              <Text style={styles.inputLabel}>Bring-in ($)</Text>
              <TextInput
                style={styles.input}
                value={customBringIn}
                onChangeText={(v) => {
                  setCustomBringIn(v);
                  setError(null);
                }}
                onBlur={handleCustomBringInBlur}
                placeholder="0.00"
                placeholderTextColor="#4a5568"
                keyboardType="decimal-pad"
                testID="input-bring-in"
              />
            </View>
          </View>
        )}

        {/* ── Max Players ─────────────────────────────────────────────────── */}
        <SectionLabel>
          {"Max Players  "}
          <Text style={styles.sectionValue} testID="max-players-value">
            {maxPlayers}
          </Text>
        </SectionLabel>
        <View style={styles.playersRow} testID="players-selector">
          {MAX_PLAYERS_OPTIONS.map((n) => {
            const active = maxPlayers === n;
            return (
              <Pressable
                key={n}
                style={[styles.playerBtn, active && styles.playerBtnActive]}
                onPress={() => setMaxPlayers(n)}
                testID={`player-btn-${n}`}
              >
                <Text
                  style={[
                    styles.playerBtnText,
                    active && styles.playerBtnTextActive,
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Buy-in ──────────────────────────────────────────────────────── */}
        <SectionLabel>Buy-in Amount</SectionLabel>
        <Card>
          <Text style={styles.buyInDollar}>$</Text>
          <TextInput
            style={styles.buyInInput}
            value={buyIn}
            onChangeText={(v) => {
              setBuyIn(v);
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#4a5568"
            testID="input-buy-in"
          />
          <Text style={styles.buyInHint} testID="buy-in-hint">
            Min: ${minBuyIn.toFixed(2)} · Available: $
            {chips.toLocaleString()}
          </Text>
        </Card>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error ? (
          <Text style={styles.errorText} testID="error-message">
            {error}
          </Text>
        ) : null}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <View style={styles.btnRow}>
          <Pressable
            style={styles.cancelBtn}
            onPress={() => router.back()}
            testID="btn-cancel"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.createBtn, submitting && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={submitting}
            testID="btn-create"
          >
            {submitting ? (
              <ActivityIndicator
                color="#0a3d14"
                size="small"
                testID="create-spinner"
              />
            ) : (
              <Text style={styles.createBtnText}>Create Game</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#1a1a2e" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 8 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionValue: { color: "#ffd700", textTransform: "none" },

  // Card container
  card: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2d3a56",
    padding: 4,
    overflow: "hidden",
  },

  divider: { height: 1, backgroundColor: "#2d3a56", marginHorizontal: 12 },

  // Variant rows
  variantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  variantSelectArea: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#4a5568",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: "#ffd700" },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffd700",
  },
  variantName: { fontSize: 15, color: "#94a3b8", flex: 1 },
  variantNameSelected: { color: "#e2e8f0", fontWeight: "600" },
  infoBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  infoBtnText: { color: "#94a3b8", fontSize: 11 },
  variantDesc: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
    paddingHorizontal: 40,
    paddingBottom: 12,
    paddingTop: 2,
  },

  // Stakes grid
  stakesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stakeBtn: {
    flex: 1,
    minWidth: "44%",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    backgroundColor: "#16213e",
    alignItems: "center",
  },
  stakeBtnActive: {
    borderColor: "#ffd700",
    backgroundColor: "#1e2a14",
  },
  stakeBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  stakeBtnTextActive: { color: "#ffd700" },

  // Custom stakes
  customRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  customField: { flex: 1, gap: 4 },
  inputLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: "#16213e",
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#e2e8f0",
    fontSize: 15,
  },

  // Players selector
  playersRow: {
    flexDirection: "row",
    gap: 8,
  },
  playerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    backgroundColor: "#16213e",
    alignItems: "center",
  },
  playerBtnActive: {
    borderColor: "#ffd700",
    backgroundColor: "#1e2a14",
  },
  playerBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  playerBtnTextActive: { color: "#ffd700" },

  // Buy-in
  buyInDollar: {
    color: "#94a3b8",
    fontSize: 20,
    paddingLeft: 12,
    paddingTop: 12,
  },
  buyInInput: {
    color: "#e2e8f0",
    fontSize: 28,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  buyInHint: {
    fontSize: 12,
    color: "#64748b",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },

  // Error
  errorText: {
    color: "#f87171",
    fontSize: 13,
    backgroundColor: "#1e1013",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
  },

  // Action buttons
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    alignItems: "center",
  },
  cancelBtnText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  createBtn: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: "#ffd700",
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: "#0a3d14", fontSize: 15, fontWeight: "700" },
});
