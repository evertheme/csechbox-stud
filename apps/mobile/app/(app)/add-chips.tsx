import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../store/auth-store";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAILY_CLAIM_KEY = "poker_daily_chips_last_claim";
const DAILY_CLAIM_AMOUNT = 100;
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export const CHIP_PACKAGES = [
  {
    id: "small",
    icon: "🪙",
    chips: 500,
    price: 4.99,
    bonus: 0,
    popular: false,
    bestValue: false,
  },
  {
    id: "medium",
    icon: "💰",
    chips: 1_500,
    price: 9.99,
    bonus: 0,
    popular: true,
    bestValue: false,
  },
  {
    id: "large",
    icon: "💎",
    chips: 5_000,
    price: 24.99,
    bonus: 500,
    popular: false,
    bestValue: false,
  },
  {
    id: "mega",
    icon: "👑",
    chips: 15_000,
    price: 49.99,
    bonus: 2_000,
    popular: false,
    bestValue: true,
  },
] as const;

export type ChipPackage = (typeof CHIP_PACKAGES)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatChips(n: number): string {
  return n.toLocaleString("en-US");
}

/** Returns the remaining ms until cooldown expires, or 0 if ready to claim. */
function msUntilNextClaim(lastClaimIso: string | null): number {
  if (!lastClaimIso) return 0;
  const elapsed = Date.now() - new Date(lastClaimIso).getTime();
  return Math.max(0, CLAIM_COOLDOWN_MS - elapsed);
}

/** Format ms into "Xh Ym" string. */
function formatCountdown(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Package card ─────────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: ChipPackage;
  selected: boolean;
  onSelect: (pkg: ChipPackage) => void;
}) {
  const total = pkg.chips + pkg.bonus;

  return (
    <Pressable
      style={[styles.packageCard, selected && styles.packageCardSelected]}
      onPress={() => onSelect(pkg)}
      testID={`package-card-${pkg.id}`}
    >
      {/* Badges */}
      <View style={styles.badgeRow}>
        {pkg.popular && (
          <View style={[styles.badge, styles.badgePopular]} testID={`badge-popular-${pkg.id}`}>
            <Text style={styles.badgeText}>🔥 POPULAR</Text>
          </View>
        )}
        {pkg.bestValue && (
          <View style={[styles.badge, styles.badgeBestValue]} testID={`badge-best-value-${pkg.id}`}>
            <Text style={styles.badgeText}>⭐ BEST VALUE</Text>
          </View>
        )}
      </View>

      {/* Icon + chips */}
      <View style={styles.packageMain}>
        <Text style={styles.packageIcon}>{pkg.icon}</Text>
        <View style={styles.packageInfo}>
          <Text style={styles.packageChips} testID={`chips-amount-${pkg.id}`}>
            {`${formatChips(pkg.chips)} Chips`}
          </Text>
          {pkg.bonus > 0 && (
            <Text style={styles.packageBonus} testID={`bonus-amount-${pkg.id}`}>
              {`🎁 +${formatChips(pkg.bonus)} Bonus`}
            </Text>
          )}
          {pkg.bonus > 0 && (
            <Text style={styles.packageTotal} testID={`total-amount-${pkg.id}`}>
              {`= ${formatChips(total)} total`}
            </Text>
          )}
        </View>
        <View style={styles.packageRight}>
          <Text style={styles.packagePrice} testID={`price-${pkg.id}`}>
            {`$${pkg.price.toFixed(2)}`}
          </Text>
          <Pressable
            style={[styles.selectBtn, selected && styles.selectBtnSelected]}
            onPress={() => onSelect(pkg)}
            testID={`btn-select-${pkg.id}`}
          >
            <Text style={[styles.selectBtnText, selected && styles.selectBtnTextSelected]}>
              {selected ? "✓ Selected" : "Select"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Daily free chips card ────────────────────────────────────────────────────

function DailyClaimCard({
  remainingMs,
  onClaim,
  claiming,
}: {
  remainingMs: number;
  onClaim: () => void;
  claiming: boolean;
}) {
  const canClaim = remainingMs === 0;

  return (
    <View style={styles.dailyCard} testID="daily-claim-card">
      <View style={styles.dailyLeft}>
        <Text style={styles.dailyIcon}>🎁</Text>
        <View>
          <Text style={styles.dailyTitle}>Daily Free Chips</Text>
          <Text style={styles.dailyAmount} testID="daily-amount">
            Claim {formatChips(DAILY_CLAIM_AMOUNT)} chips
          </Text>
          {!canClaim && (
            <Text style={styles.dailyCountdown} testID="daily-countdown">
              {`Next in: ${formatCountdown(remainingMs)}`}
            </Text>
          )}
        </View>
      </View>

      <Pressable
        style={[
          styles.claimBtn,
          !canClaim && styles.claimBtnDisabled,
        ]}
        onPress={onClaim}
        disabled={!canClaim || claiming}
        accessibilityState={{ disabled: !canClaim || claiming }}
        testID="btn-claim"
      >
        <Text style={[styles.claimBtnText, !canClaim && styles.claimBtnTextDisabled]}>
          {claiming ? "Claiming…" : canClaim ? "Claim" : "Claimed"}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── AddChipsScreen ───────────────────────────────────────────────────────────

export default function AddChipsScreen() {
  const { chips, updateChips } = useAuthStore();

  const [selected, setSelected] = useState<ChipPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [claiming, setClaiming] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  // ── Load daily claim state ────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(DAILY_CLAIM_KEY);
      const ms = msUntilNextClaim(raw);
      setRemainingMs(ms);
    })();
  }, []);

  // ── Countdown ticker ─────────────────────────────────────────────────────

  useEffect(() => {
    if (remainingMs <= 0) {
      clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) clearInterval(countdownRef.current);
        return next;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [remainingMs]);

  // ── Purchase flow ─────────────────────────────────────────────────────────

  const handleSelect = useCallback((pkg: ChipPackage) => {
    setSelected((prev) => (prev?.id === pkg.id ? null : pkg));
  }, []);

  const handlePurchase = useCallback(() => {
    if (!selected) return;
    const total = selected.chips + selected.bonus;
    Alert.alert(
      "Confirm Purchase",
      `Buy ${formatChips(total)} chips for $${selected.price.toFixed(2)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Pay $${selected.price.toFixed(2)}`,
          onPress: () => {
            setPurchasing(true);
            // Simulate the in-app purchase flow.  In production, replace this
            // with a real IAP library (e.g. expo-iap or react-native-iap).
            setTimeout(() => {
              updateChips(chips + total);
              setPurchasing(false);
              setSelected(null);
              Alert.alert(
                "Purchase Successful! 🎉",
                `${formatChips(total)} chips have been added to your balance.`
              );
            }, 1500);
          },
        },
      ]
    );
  }, [selected, chips, updateChips]);

  // ── Daily claim ───────────────────────────────────────────────────────────

  const handleClaim = useCallback(async () => {
    if (remainingMs > 0) return;
    setClaiming(true);
    try {
      const now = new Date().toISOString();
      await AsyncStorage.setItem(DAILY_CLAIM_KEY, now);
      updateChips(chips + DAILY_CLAIM_AMOUNT);
      setRemainingMs(CLAIM_COOLDOWN_MS);
      Alert.alert("Chips Claimed! 🎁", `${DAILY_CLAIM_AMOUNT} free chips added!`);
    } catch {
      Alert.alert("Error", "Could not claim chips. Please try again.");
    } finally {
      setClaiming(false);
    }
  }, [remainingMs, chips, updateChips]);

  return (
    <>
      <Stack.Screen options={{ title: "Add Chips", headerBackTitle: "Profile" }} />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        testID="add-chips-scroll"
      >
        {/* Balance header */}
        <View style={styles.balanceHeader} testID="balance-header">
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceAmount} testID="balance-amount">
            {`$${formatChips(chips)} chips`}
          </Text>
        </View>

        {/* Package list */}
        <Text style={styles.sectionLabel}>Select Package</Text>

        {CHIP_PACKAGES.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            selected={selected?.id === pkg.id}
            onSelect={handleSelect}
          />
        ))}

        {/* Purchase button */}
        {selected && (
          <Pressable
            style={[styles.purchaseBtn, purchasing && { opacity: 0.6 }]}
            onPress={handlePurchase}
            disabled={purchasing}
            testID="btn-purchase"
          >
            <Text style={styles.purchaseBtnText}>
              {purchasing
                ? "Processing…"
                : `Buy ${formatChips(selected.chips + selected.bonus)} chips — $${selected.price.toFixed(2)}`}
            </Text>
          </Pressable>
        )}

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Daily claim */}
        <DailyClaimCard
          remainingMs={remainingMs}
          onClaim={() => void handleClaim()}
          claiming={claiming}
        />

        {/* Fine print */}
        <Text style={styles.finePrint}>
          Chips are virtual currency with no real-world value. Purchases are
          non-refundable.
        </Text>
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0f1a" },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  // Balance header
  balanceHeader: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    padding: 18,
    alignItems: "center",
    marginBottom: 4,
  },
  balanceLabel: { fontSize: 12, color: "#64748b", fontWeight: "600", letterSpacing: 1 },
  balanceAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffd700",
    marginTop: 4,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 1,
    paddingHorizontal: 2,
    marginBottom: -4,
    marginTop: 4,
  },

  // Package card
  packageCard: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#21262d",
    padding: 14,
    gap: 8,
  },
  packageCardSelected: {
    borderColor: "#ffd700",
    backgroundColor: "#1a1a0a",
  },
  badgeRow: { flexDirection: "row", gap: 6 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgePopular: { backgroundColor: "#7f1d1d" },
  badgeBestValue: { backgroundColor: "#14532d" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  packageMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  packageIcon: { fontSize: 28 },
  packageInfo: { flex: 1, gap: 2 },
  packageChips: { fontSize: 16, fontWeight: "700", color: "#e2e8f0" },
  packageBonus: { fontSize: 13, color: "#22c55e", fontWeight: "600" },
  packageTotal: { fontSize: 12, color: "#64748b" },
  packageRight: { alignItems: "flex-end", gap: 8 },
  packagePrice: { fontSize: 17, fontWeight: "800", color: "#ffd700" },
  selectBtn: {
    backgroundColor: "#21262d",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  selectBtnSelected: { backgroundColor: "#ffd700" },
  selectBtnText: { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  selectBtnTextSelected: { color: "#0a1628" },

  // Purchase button
  purchaseBtn: {
    backgroundColor: "#ffd700",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  purchaseBtnText: { fontSize: 16, fontWeight: "800", color: "#0a1628" },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 8,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#21262d" },
  dividerText: { fontSize: 13, color: "#64748b", fontWeight: "600" },

  // Daily claim
  dailyCard: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dailyLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  dailyIcon: { fontSize: 28 },
  dailyTitle: { fontSize: 14, fontWeight: "700", color: "#e2e8f0" },
  dailyAmount: { fontSize: 13, color: "#22c55e", fontWeight: "600" },
  dailyCountdown: { fontSize: 12, color: "#64748b", marginTop: 2 },
  claimBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: "center",
  },
  claimBtnDisabled: { backgroundColor: "#21262d" },
  claimBtnText: { fontSize: 14, fontWeight: "700", color: "#0a1628" },
  claimBtnTextDisabled: { color: "#4a5568" },

  // Fine print
  finePrint: {
    fontSize: 11,
    color: "#334155",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 8,
  },
});
