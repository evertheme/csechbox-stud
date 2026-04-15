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
import { getSocket } from "../../lib/socket";
import { GAME_REGISTRY } from "../../lib/gameRegistry";

// ─── Constants ────────────────────────────────────────────────────────────────

const FIXED_STAKES = { ante: 1, bringIn: 2 } as const;
const REBUY_TIMEOUT_SECONDS = 120 as const;
const ROOM_CREATE_TIMEOUT_MS = 10_000;

const BUY_IN_PRESETS = [500, 1_000, 2_500, 5_000] as const;
const BUY_IN_DEFAULT = 1_000;
const BUY_IN_MIN = 100;
const BUY_IN_MAX = 10_000;

const DEFAULT_MAX_PLAYERS = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 5-card variants seat up to 5 players; all 7-card variants seat up to 7. */
function playerLimitForVariant(gameTypeId: string): number {
  return gameTypeId.startsWith("5-card") ? 5 : 7;
}

function playerOptions(limit: number): number[] {
  return Array.from({ length: limit - 1 }, (_, i) => i + 2); // [2, 3, …, limit]
}

function formatChips(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Card({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  dim,
  testID,
}: {
  label: string;
  value: string;
  dim?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, dim && styles.infoValueDim]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

// ─── CreateGameScreen ─────────────────────────────────────────────────────────

export default function CreateGameScreen() {
  // ── Form state ─────────────────────────────────────────────────────────────

  const [gameTypeId, setGameTypeId] = useState(GAME_REGISTRY[0]!.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
  const [buyInPreset, setBuyInPreset] = useState<number | "custom">(BUY_IN_DEFAULT);
  const [customBuyIn, setCustomBuyIn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Derived values ─────────────────────────────────────────────────────────

  const playerLimit = playerLimitForVariant(gameTypeId);
  const startingBuyIn = buyInPreset === "custom"
    ? parseFloat(customBuyIn) || 0
    : buyInPreset;
  const minRebuy = Math.round(startingBuyIn * 0.5);
  const maxRebuy = Math.round(startingBuyIn * 2);
  const selectedVariant = GAME_REGISTRY.find((v) => v.id === gameTypeId);

  // ── Clamp maxPlayers when game type changes ────────────────────────────────

  useEffect(() => {
    if (maxPlayers > playerLimit) setMaxPlayers(playerLimit);
  }, [gameTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    const onRoomCreated = ({ roomId }: { roomId: string }) => {
      clearTimeout(timeoutRef.current);
      setSubmitting(false);
      router.replace(`/(app)/game/${roomId}`);
    };

    const onCreateError = ({ message }: { message?: string }) => {
      clearTimeout(timeoutRef.current);
      setSubmitting(false);
      setError(message ?? "Failed to create room. Please try again.");
    };

    socket.on("room-created", onRoomCreated);
    socket.on("create-room-error", onCreateError);

    return () => {
      socket.off("room-created", onRoomCreated);
      socket.off("create-room-error", onCreateError);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (buyInPreset === "custom") {
      const v = parseFloat(customBuyIn);
      if (isNaN(v) || v <= 0) return "Please enter a valid buy-in amount.";
    }
    if (startingBuyIn < BUY_IN_MIN)
      return `Minimum buy-in is ${formatChips(BUY_IN_MIN)}.`;
    if (startingBuyIn > BUY_IN_MAX)
      return `Maximum buy-in is ${formatChips(BUY_IN_MAX)}.`;
    return null;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);

    timeoutRef.current = setTimeout(() => {
      setSubmitting(false);
      setError("Server did not respond. Please try again.");
    }, ROOM_CREATE_TIMEOUT_MS);

    getSocket().emit("create-room", {
      gameType: gameTypeId,
      maxPlayers,
      startingBuyIn,
      minRebuy,
      maxRebuy,
      stakes: FIXED_STAKES,
      allowRebuys: true,
      rebuyTimeoutSeconds: REBUY_TIMEOUT_SECONDS,
      endConditions: { manualEnd: true, onePlayerRemains: true },
    });
  }, [gameTypeId, maxPlayers, startingBuyIn, minRebuy, maxRebuy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ title: "Create Game", headerBackTitle: "Lobby" }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Game Variant ─────────────────────────────────────────────────── */}
        <SectionLabel>Game Variant</SectionLabel>
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
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Text
                      style={[styles.variantName, selected && styles.variantNameSelected]}
                      testID={`variant-name-${variant.id}`}
                    >
                      {variant.name}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.infoBtn}
                    onPress={() => setExpandedId(expanded ? null : variant.id)}
                    testID={`info-btn-${variant.id}`}
                    hitSlop={10}
                  >
                    <Text style={styles.infoBtnText}>{expanded ? "▲" : "▼"}</Text>
                  </Pressable>
                </View>

                {expanded && (
                  <Text style={styles.variantDesc} testID={`desc-${variant.id}`}>
                    {variant.description}
                  </Text>
                )}
              </View>
            );
          })}
        </Card>

        {/* ── Max Players ──────────────────────────────────────────────────── */}
        <SectionLabel>
          {"Max Players  "}
          <Text style={styles.sectionValue} testID="max-players-value">
            {maxPlayers}
          </Text>
        </SectionLabel>
        <View style={styles.playersRow} testID="players-selector">
          {playerOptions(playerLimit).map((n) => {
            const active = maxPlayers === n;
            return (
              <Pressable
                key={n}
                style={[styles.playerBtn, active && styles.playerBtnActive]}
                onPress={() => setMaxPlayers(n)}
                testID={`player-btn-${n}`}
              >
                <Text style={[styles.playerBtnText, active && styles.playerBtnTextActive]}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.playerHint} testID="player-limit-hint">
          {gameTypeId.startsWith("5-card") ? "5-card games: max 5 players" : "7-card games: max 7 players"}
        </Text>

        {/* ── Starting Buy-in ───────────────────────────────────────────────── */}
        <SectionLabel>Starting Buy-in</SectionLabel>
        <Text style={styles.buyInSubtitle}>All players start with:</Text>
        <Card testID="buy-in-card">
          {BUY_IN_PRESETS.map((amount) => {
            const active = buyInPreset === amount;
            return (
              <Pressable
                key={amount}
                style={styles.buyInOption}
                onPress={() => {
                  setBuyInPreset(amount);
                  setError(null);
                }}
                testID={`buy-in-preset-${amount}`}
              >
                <View style={[styles.radio, active && styles.radioSelected]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.buyInOptionText, active && styles.buyInOptionTextActive]}>
                  {formatChips(amount)}
                  {amount === BUY_IN_DEFAULT ? "  (recommended)" : ""}
                </Text>
              </Pressable>
            );
          })}

          {/* Custom option */}
          <Pressable
            style={styles.buyInOption}
            onPress={() => {
              setBuyInPreset("custom");
              setError(null);
            }}
            testID="buy-in-custom"
          >
            <View style={[styles.radio, buyInPreset === "custom" && styles.radioSelected]}>
              {buyInPreset === "custom" && <View style={styles.radioDot} />}
            </View>
            <Text style={[styles.buyInOptionText, buyInPreset === "custom" && styles.buyInOptionTextActive]}>
              Custom:{"  "}
            </Text>
            {buyInPreset === "custom" && (
              <TextInput
                style={styles.customBuyInInput}
                value={customBuyIn}
                onChangeText={(v) => {
                  setCustomBuyIn(v);
                  setError(null);
                }}
                keyboardType="number-pad"
                placeholder="1000"
                placeholderTextColor="#4a5568"
                testID="input-custom-buy-in"
              />
            )}
          </Pressable>

          <Text style={styles.buyInRange} testID="buy-in-range">
            Min: {formatChips(BUY_IN_MIN)} | Max: {formatChips(BUY_IN_MAX)}
          </Text>
        </Card>

        {/* ── Stakes (read-only) ────────────────────────────────────────────── */}
        <SectionLabel>Stakes</SectionLabel>
        <Card testID="stakes-card">
          <View style={styles.fixedRow}>
            <Text style={styles.fixedValue} testID="stakes-display">$1 / $2</Text>
            <Text style={styles.fixedHint}>Fixed for all games</Text>
          </View>
        </Card>

        {/* ── Rebuy Settings (read-only) ────────────────────────────────────── */}
        <SectionLabel>Rebuy Options</SectionLabel>
        <Card testID="rebuy-card">
          <InfoRow
            label="Min rebuy"
            value={startingBuyIn >= BUY_IN_MIN ? formatChips(minRebuy) : "—"}
            testID="rebuy-min"
          />
          <View style={styles.infoRowDivider} />
          <InfoRow
            label="Max rebuy"
            value={startingBuyIn >= BUY_IN_MIN ? formatChips(maxRebuy) : "—"}
            testID="rebuy-max"
          />
          <View style={styles.infoRowDivider} />
          <InfoRow label="Timeout" value="2 minutes" testID="rebuy-timeout" />
          {startingBuyIn >= BUY_IN_MIN && (
            <Text style={styles.rebuyNote} testID="rebuy-note">
              {`Based on ${formatChips(startingBuyIn)} buy-in`}
            </Text>
          )}
        </Card>

        {/* ── Game Summary ──────────────────────────────────────────────────── */}
        <SectionLabel>📋 Game Summary</SectionLabel>
        <Card testID="summary-card">
          <InfoRow label="Variant" value={selectedVariant?.name ?? "—"} testID="summary-variant" />
          <View style={styles.infoRowDivider} />
          <InfoRow label="Players" value={`2–${maxPlayers}`} testID="summary-players" />
          <View style={styles.infoRowDivider} />
          <InfoRow label="Stakes" value="$1/$2" testID="summary-stakes" />
          <View style={styles.infoRowDivider} />
          <InfoRow
            label="Buy-in"
            value={startingBuyIn >= BUY_IN_MIN ? formatChips(startingBuyIn) : "—"}
            testID="summary-buy-in"
          />
          <View style={styles.infoRowDivider} />
          <InfoRow
            label="Rebuys"
            value={startingBuyIn >= BUY_IN_MIN ? `${formatChips(minRebuy)}–${formatChips(maxRebuy)}` : "—"}
            testID="summary-rebuys"
          />
          <View style={styles.summarySeparator} />
          <Text style={styles.summaryEndTitle}>Game ends when:</Text>
          <Text style={styles.summaryEndItem}>• You end it, OR</Text>
          <Text style={styles.summaryEndItem}>• 1 player remains</Text>
        </Card>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <Text style={styles.errorText} testID="error-message">
            {error}
          </Text>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
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
              <ActivityIndicator color="#0a3d14" size="small" testID="create-spinner" />
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

  card: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2d3a56",
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
  variantSelectArea: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10 },
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
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffd700" },
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

  // Players
  playersRow: { flexDirection: "row", gap: 8 },
  playerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    backgroundColor: "#16213e",
    alignItems: "center",
  },
  playerBtnActive: { borderColor: "#ffd700", backgroundColor: "#1e2a14" },
  playerBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  playerBtnTextActive: { color: "#ffd700" },
  playerHint: { fontSize: 11, color: "#4a5568", marginTop: 2 },

  // Buy-in options
  buyInSubtitle: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  buyInOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e2a3a",
  },
  buyInOptionText: { fontSize: 15, color: "#94a3b8", flex: 1 },
  buyInOptionTextActive: { color: "#e2e8f0", fontWeight: "600" },
  customBuyInInput: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ffd700",
    paddingVertical: 2,
    minWidth: 80,
  },
  buyInRange: {
    fontSize: 11,
    color: "#4a5568",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  // Fixed stakes
  fixedRow: { padding: 14, gap: 2 },
  fixedValue: { fontSize: 20, fontWeight: "700", color: "#ffd700" },
  fixedHint: { fontSize: 12, color: "#64748b" },

  // Info rows (rebuy + summary)
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  infoRowDivider: { height: 1, backgroundColor: "#1e2a3a", marginHorizontal: 14 },
  infoLabel: { fontSize: 14, color: "#94a3b8" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#e2e8f0" },
  infoValueDim: { color: "#64748b" },
  rebuyNote: { fontSize: 11, color: "#4a5568", paddingHorizontal: 14, paddingBottom: 10 },

  // Summary
  summarySeparator: { height: 1, backgroundColor: "#2d3a56", marginHorizontal: 14, marginTop: 8 },
  summaryEndTitle: { fontSize: 13, color: "#64748b", paddingHorizontal: 14, paddingTop: 10, fontWeight: "600" },
  summaryEndItem: { fontSize: 13, color: "#64748b", paddingHorizontal: 14, paddingBottom: 4 },

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

  // Buttons
  btnRow: { flexDirection: "row", gap: 12, marginTop: 20 },
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
