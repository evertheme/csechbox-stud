import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import {
  fetchDetailedStats,
  formatDollars,
  type DetailedStats,
} from "../../lib/statsApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  valueColor,
  last = false,
  testID,
}: {
  label: string;
  value: string;
  valueColor?: string;
  last?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.statRow, last && styles.statRowLast]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[styles.statValue, valueColor ? { color: valueColor } : null]}
        testID={testID}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── AddChipsScreen ───────────────────────────────────────────────────────────

export default function AddChipsScreen() {
  const { user, session } = useAuthStore();
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);

  const accessToken = session?.access_token ?? null;

  const loadStats = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchDetailedStats(user.id, accessToken);
      setStats(data);
    } catch {
      // Stats are informational — silently degrade rather than block the screen.
    } finally {
      setLoading(false);
    }
  }, [user?.id, accessToken]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const avgProfit =
    stats && stats.totalGames > 0
      ? Math.round(stats.netProfit / stats.totalGames)
      : null;

  const avgProfitStr =
    avgProfit !== null
      ? `${avgProfit >= 0 ? "+" : ""}$${Math.abs(avgProfit).toLocaleString("en-US")}`
      : "—";

  const avgProfitColor =
    avgProfit !== null && avgProfit >= 0 ? "#22c55e" : "#f87171";

  return (
    <>
      <Stack.Screen options={{ title: "Chip Balance", headerBackTitle: "Back" }} />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        testID="add-chips-scroll"
      >
        {/* Unlimited chips */}
        <View style={styles.unlimitedCard} testID="unlimited-card">
          <Text style={styles.unlimitedIcon}>♾️</Text>
          <Text style={styles.unlimitedTitle}>Unlimited</Text>
          <Text style={styles.unlimitedBody}>
            In a friendly game, chips are free and unlimited!
          </Text>
          <Text style={styles.unlimitedSub}>
            You can rebuy anytime between hands.
          </Text>
        </View>

        {/* Session history */}
        <View style={styles.historyCard} testID="session-history-card">
          <View style={styles.historyHeader}>
            <Text style={styles.historyHeaderIcon}>📊</Text>
            <Text style={styles.historyHeaderTitle}>Your Session History</Text>
          </View>

          {loading ? (
            <ActivityIndicator
              color="#ffd700"
              style={styles.loader}
              testID="stats-loader"
            />
          ) : stats ? (
            <View testID="stats-rows">
              <StatRow
                label="Total sessions"
                value={`${stats.totalGames}`}
                testID="stat-total-sessions"
              />
              <StatRow
                label="Avg profit/session"
                value={avgProfitStr}
                valueColor={avgProfitColor}
                testID="stat-avg-profit"
              />
              <StatRow
                label="Best session"
                value={`+${formatDollars(stats.biggestWin)}`}
                valueColor="#22c55e"
                testID="stat-best-session"
              />
              <StatRow
                label="Worst session"
                value={formatDollars(stats.biggestLoss)}
                valueColor="#f87171"
                testID="stat-worst-session"
                last
              />
            </View>
          ) : (
            <Text style={styles.noStats} testID="no-stats">
              Play a session to see your history here.
            </Text>
          )}

          <Pressable
            style={styles.viewAllBtn}
            onPress={() => router.push("/(app)/stats")}
            testID="btn-view-sessions"
          >
            <Text style={styles.viewAllBtnText}>View All Sessions</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0f1a" },
  content: { padding: 16, gap: 16, paddingBottom: 40 },

  // Unlimited card
  unlimitedCard: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  unlimitedIcon: { fontSize: 48 },
  unlimitedTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffd700",
    marginTop: 4,
  },
  unlimitedBody: {
    fontSize: 15,
    color: "#e2e8f0",
    textAlign: "center",
    lineHeight: 22,
  },
  unlimitedSub: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },

  // Session history card
  historyCard: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    overflow: "hidden",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#21262d",
  },
  historyHeaderIcon: { fontSize: 18 },
  historyHeaderTitle: { fontSize: 15, fontWeight: "700", color: "#e2e8f0" },

  // Stat rows
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#21262d",
  },
  statRowLast: { borderBottomWidth: 0 },
  statLabel: { fontSize: 14, color: "#94a3b8" },
  statValue: { fontSize: 14, fontWeight: "700", color: "#e2e8f0" },

  // Loading / empty
  loader: { paddingVertical: 24 },
  noStats: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    padding: 24,
  },

  // View all button
  viewAllBtn: {
    margin: 16,
    backgroundColor: "#21262d",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  viewAllBtnText: { fontSize: 15, fontWeight: "700", color: "#ffd700" },
});
