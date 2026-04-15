import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { LineChart, PieChart } from "react-native-chart-kit";
import { useAuthStore } from "../../store/auth-store";
import {
  fetchDetailedStats,
  formatDollars,
  timeAgo,
  type DetailedStats,
  type GameHistory,
} from "../../lib/statsApi";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_WIDTH = SCREEN_WIDTH - 32;
const TABS = ["Overview", "History"] as const;
type Tab = (typeof TABS)[number];

// Colour palette for pie slices (game-type distribution).
const PIE_COLORS = ["#ffd700", "#22c55e", "#60a5fa", "#f87171", "#a78bfa", "#fb923c"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function StatRow({
  label,
  value,
  valueColor,
  testID,
}: {
  label: string;
  value: string;
  valueColor?: string;
  testID?: string;
}) {
  return (
    <View style={styles.statRow}>
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

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ width, height }: { width: number | string; height: number }) {
  return (
    <View
      style={[styles.skeleton, { width: width as number, height }]}
      testID="skeleton-block"
    />
  );
}

function StatsSkeleton() {
  return (
    <View testID="stats-skeleton" style={styles.skeletonWrapper}>
      {[120, 100, 160, 80].map((h, i) => (
        <Skeleton key={i} width="100%" height={h} />
      ))}
    </View>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onPress,
}: {
  active: Tab;
  onPress: (tab: Tab) => void;
}) {
  return (
    <View style={styles.tabBar} testID="tab-bar">
      {TABS.map((tab) => (
        <Pressable
          key={tab}
          style={[styles.tab, active === tab && styles.tabActive]}
          onPress={() => onPress(tab)}
          testID={`tab-${tab.toLowerCase()}`}
        >
          <Text style={[styles.tabText, active === tab && styles.tabTextActive]}>
            {tab}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function streakLabel(count: number, type: "W" | "L" | null): string {
  if (!count || !type) return "—";
  return `${count}${type}`;
}

function OverviewTab({ stats }: { stats: DetailedStats }) {
  // Win-rate line-chart data
  const lineData = useMemo(() => {
    const points = stats.winRateHistory.slice(-10); // last 10 points
    return {
      labels: points.map((p) => p.date.slice(5)), // "MM-DD"
      datasets: [{ data: points.map((p) => p.winRate) }],
    };
  }, [stats.winRateHistory]);

  const hasLineData = lineData.datasets[0].data.length > 1;

  // Pie-chart data
  const pieData = useMemo(
    () =>
      stats.gameTypeDistribution.map((item, i) => ({
        name: item.gameType,
        population: item.count,
        color: PIE_COLORS[i % PIE_COLORS.length] ?? "#64748b",
        legendFontColor: "#94a3b8",
        legendFontSize: 12,
      })),
    [stats.gameTypeDistribution]
  );

  const hasPieData = pieData.length > 0;
  const netColor = stats.netProfit >= 0 ? "#22c55e" : "#f87171";
  const netPrefix = stats.netProfit >= 0 ? "+" : "";

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      testID="overview-tab"
    >
      {/* Games overview */}
      <SectionHeader icon="🎮" title="Games Overview" />
      <Card>
        <StatRow
          label="Total Games"
          value={`${stats.totalGames}`}
          testID="stat-total-games"
        />
        <StatRow
          label="Games Won"
          value={`${stats.gamesWon}`}
          testID="stat-games-won"
        />
        <StatRow
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          testID="stat-win-rate"
        />
        <StatRow
          label="Current Streak"
          value={streakLabel(stats.currentStreak, stats.currentStreakType)}
          testID="stat-current-streak"
        />
        <StatRow
          label="Best Streak"
          value={streakLabel(stats.bestStreak, stats.bestStreakType)}
          testID="stat-best-streak"
        />
      </Card>

      {/* Win rate over time */}
      {hasLineData && (
        <>
          <SectionHeader icon="📈" title="Win Rate Over Time" />
          <View style={styles.chartWrapper} testID="line-chart-wrapper">
            <LineChart
              data={lineData}
              width={CHART_WIDTH}
              height={180}
              yAxisSuffix="%"
              yAxisInterval={1}
              chartConfig={LINE_CHART_CONFIG}
              bezier
              style={styles.chart}
            />
          </View>
        </>
      )}

      {/* Hand statistics */}
      <SectionHeader icon="🃏" title="Hand Statistics" />
      <Card>
        <StatRow
          label="Hands Played"
          value={`${stats.handsPlayed}`}
          testID="stat-hands-played"
        />
        <StatRow
          label="Hands Won"
          value={`${stats.handsWon}`}
          testID="stat-hands-won"
        />
        <StatRow
          label="Showdown Win Rate"
          value={`${stats.showdownWinRate.toFixed(0)}%`}
          testID="stat-showdown-win-rate"
        />
        <StatRow
          label="Fold Rate"
          value={`${stats.foldRate.toFixed(0)}%`}
          testID="stat-fold-rate"
        />
      </Card>

      {/* Financial */}
      <SectionHeader icon="💵" title="Financial Stats" />
      <Card>
        <StatRow
          label="Total Winnings"
          value={formatDollars(stats.totalWinnings)}
          valueColor="#22c55e"
          testID="stat-total-winnings"
        />
        <StatRow
          label="Total Losses"
          value={formatDollars(stats.totalLosses)}
          valueColor="#f87171"
          testID="stat-total-losses"
        />
        <StatRow
          label="Net Profit"
          value={`${netPrefix}${formatDollars(stats.netProfit)}`}
          valueColor={netColor}
          testID="stat-net-profit"
        />
        <StatRow
          label="Biggest Win"
          value={formatDollars(stats.biggestWin)}
          testID="stat-biggest-win"
        />
        <StatRow
          label="Biggest Loss"
          value={formatDollars(stats.biggestLoss)}
          testID="stat-biggest-loss"
        />
        <StatRow
          label="Avg Pot Won"
          value={formatDollars(stats.avgPotWon)}
          testID="stat-avg-pot-won"
        />
      </Card>

      {/* Best hands */}
      <SectionHeader icon="🏆" title="Best Hands" />
      <Card>
        <StatRow
          label="Royal Flush"
          value={`${stats.bestHands.royalFlush}`}
          testID="stat-royal-flush"
        />
        <StatRow
          label="Straight Flush"
          value={`${stats.bestHands.straightFlush}`}
          testID="stat-straight-flush"
        />
        <StatRow
          label="Four of a Kind"
          value={`${stats.bestHands.fourOfAKind}`}
          testID="stat-four-of-a-kind"
        />
        <StatRow
          label="Full House"
          value={`${stats.bestHands.fullHouse}`}
          testID="stat-full-house"
        />
        <StatRow
          label="Flush"
          value={`${stats.bestHands.flush}`}
          testID="stat-flush"
        />
        <StatRow
          label="Straight"
          value={`${stats.bestHands.straight}`}
          testID="stat-straight"
        />
      </Card>

      {/* Game-type distribution */}
      {hasPieData && (
        <>
          <SectionHeader icon="🎲" title="Game Type Distribution" />
          <View style={styles.chartWrapper} testID="pie-chart-wrapper">
            <PieChart
              data={pieData}
              width={CHART_WIDTH}
              height={180}
              chartConfig={LINE_CHART_CONFIG}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="8"
              style={styles.chart}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ─── History item ─────────────────────────────────────────────────────────────

function HistoryItem({ game }: { game: GameHistory }) {
  const won = game.result === "won";
  const amountStr = won
    ? `+${formatDollars(game.amountDelta)}`
    : formatDollars(game.amountDelta);

  const handlePress = () => {
    router.push(`/(app)/game-details/${game.id}`);
  };

  return (
    <Pressable
      style={styles.historyCard}
      onPress={handlePress}
      testID={`history-item-${game.id}`}
    >
      <View style={styles.historyTop}>
        <Text style={styles.historyGameType}>{game.gameType}</Text>
        <Text style={styles.historyTime}>{timeAgo(game.playedAt)}</Text>
      </View>
      <View style={styles.historyBottom}>
        <Text
          style={[styles.historyResult, won ? styles.resultWon : styles.resultLost]}
        >
          {won ? "Won" : "Lost"} {amountStr}
        </Text>
        <Text style={styles.historyPosition}>
          {game.position}/{game.totalPlayers}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ games }: { games: GameHistory[] }) {
  if (games.length === 0) {
    return (
      <View style={styles.emptyState} testID="history-empty">
        <Text style={styles.emptyIcon}>🎮</Text>
        <Text style={styles.emptyTitle}>No games yet</Text>
        <Text style={styles.emptySubtitle}>
          Play your first game to see your history here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent} testID="history-tab">
      <Text style={styles.historyCountLabel}>
        {games.length} recent game{games.length !== 1 ? "s" : ""}
      </Text>
      {games.map((game) => (
        <HistoryItem key={game.id} game={game} />
      ))}
    </ScrollView>
  );
}

// ─── StatsScreen ──────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { user, session } = useAuthStore();
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const accessToken = session?.access_token ?? null;

  const loadStats = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) return;
      if (!isRefresh) setLoading(true);
      setError(null);
      try {
        const data = await fetchDetailedStats(user.id, accessToken);
        setStats(data);
      } catch {
        setError("Could not load stats. Pull to refresh.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, accessToken]
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadStats(true);
  }, [loadStats]);

  return (
    <>
      <Stack.Screen options={{ title: "Your Stats", headerBackTitle: "Profile" }} />

      <View style={styles.root}>
        <TabBar active={activeTab} onPress={setActiveTab} />

        {loading ? (
          <ScrollView
            contentContainerStyle={styles.tabContent}
            testID="loading-scroll"
          >
            <StatsSkeleton />
          </ScrollView>
        ) : error ? (
          <ScrollView
            contentContainerStyle={styles.errorContainer}
            testID="error-scroll"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#ffd700"
              />
            }
          >
            <Text style={styles.errorText} testID="error-message">
              {error}
            </Text>
          </ScrollView>
        ) : stats ? (
          <ScrollView
            contentContainerStyle={styles.outerScroll}
            testID="stats-scroll"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#ffd700"
                testID="refresh-control"
              />
            }
          >
            {activeTab === "Overview" ? (
              <OverviewTab stats={stats} />
            ) : (
              <HistoryTab games={stats.recentGames} />
            )}
          </ScrollView>
        ) : null}
      </View>
    </>
  );
}

// ─── Chart config ─────────────────────────────────────────────────────────────

const LINE_CHART_CONFIG = {
  backgroundColor: "#0d1117",
  backgroundGradientFrom: "#161b22",
  backgroundGradientTo: "#161b22",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 215, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
  style: { borderRadius: 12 },
  propsForDots: { r: "4", strokeWidth: "2", stroke: "#ffd700" },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0f1a" },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#161b22",
    borderBottomWidth: 1,
    borderColor: "#21262d",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#ffd700",
  },
  tabText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  tabTextActive: { color: "#ffd700" },

  // Content areas
  outerScroll: { flexGrow: 1 },
  tabContent: { padding: 16, gap: 12 },
  errorContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: "#f87171", fontSize: 15, textAlign: "center" },

  // Sections
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#e2e8f0" },

  // Card
  card: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },

  // Stat row
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#21262d",
  },
  statLabel: { fontSize: 14, color: "#94a3b8" },
  statValue: { fontSize: 14, fontWeight: "700", color: "#e2e8f0" },

  // Charts
  chartWrapper: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#21262d",
  },
  chart: { borderRadius: 12 },

  // History
  historyCountLabel: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 4,
  },
  historyCard: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    padding: 14,
    gap: 8,
  },
  historyTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  historyGameType: { fontSize: 14, fontWeight: "700", color: "#e2e8f0" },
  historyTime: { fontSize: 12, color: "#64748b" },
  historyBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyResult: { fontSize: 14, fontWeight: "600" },
  historyPosition: { fontSize: 13, color: "#64748b" },
  resultWon: { color: "#22c55e" },
  resultLost: { color: "#f87171" },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 10,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#e2e8f0" },
  emptySubtitle: { fontSize: 14, color: "#64748b", textAlign: "center" },

  // Skeleton
  skeletonWrapper: { gap: 12 },
  skeleton: {
    backgroundColor: "#21262d",
    borderRadius: 12,
  },
});
