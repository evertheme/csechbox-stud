import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { fetchGames } from "../../lib/gamesApi";
import { connectSocket, getSocket } from "../../lib/socket";
import type { GameRoom, RoomJoinedPayload } from "../../types/game";

const POLL_INTERVAL_MS = 5_000;

// ─── Game card ────────────────────────────────────────────────────────────────

interface GameCardProps {
  game: GameRoom;
  joining: boolean;
  onJoin: () => void;
}

function GameCard({ game, joining, onJoin }: GameCardProps) {
  const isFull = game.players >= game.maxPlayers;

  return (
    <View style={styles.card} testID={`game-card-${game.id}`}>
      <View style={styles.cardTop}>
        <Text style={styles.gameType} testID={`game-type-${game.id}`}>
          {game.gameType}
        </Text>
        <View
          style={[styles.badge, isFull ? styles.badgeFull : styles.badgeOpen]}
        >
          <Text style={styles.badgeText}>{isFull ? "FULL" : "OPEN"}</Text>
        </View>
      </View>

      <Text style={styles.gameName} testID={`game-name-${game.id}`}>
        {game.name}
      </Text>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText} testID={`game-stakes-${game.id}`}>
          Stakes: {game.stakes}
        </Text>
        <Text style={styles.metaText} testID={`game-players-${game.id}`}>
          Players: {game.players}/{game.maxPlayers}
        </Text>
      </View>

      <Pressable
        style={[styles.joinBtn, (isFull || joining) && styles.joinBtnDisabled]}
        onPress={onJoin}
        disabled={isFull || joining}
        testID={`btn-join-${game.id}`}
        accessibilityState={{ disabled: isFull || joining }}
      >
        {joining ? (
          <ActivityIndicator
            color="#0a3d14"
            size="small"
            testID={`join-spinner-${game.id}`}
          />
        ) : (
          <Text style={styles.joinBtnText}>{isFull ? "Full" : "Join Game"}</Text>
        )}
      </Pressable>
    </View>
  );
}

// ─── Lobby header ─────────────────────────────────────────────────────────────

interface LobbyHeaderProps {
  username: string;
  chips: number;
  onSignOut: () => void;
}

function LobbyHeader({ username, chips, onSignOut }: LobbyHeaderProps) {
  return (
    <View style={styles.header} testID="lobby-header">
      <View style={styles.headerInfo}>
        <Text style={styles.welcome} testID="welcome-text">
          Welcome, {username}
        </Text>
        <Text style={styles.chips} testID="chips-text">
          Chips: ${chips.toLocaleString()}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push("/(app)/profile")}
          testID="btn-profile"
        >
          <Text style={styles.iconBtnIcon}>👤</Text>
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push("/(app)/settings")}
          testID="btn-settings"
        >
          <Text style={styles.iconBtnIcon}>⚙️</Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, styles.logoutBtn]}
          onPress={onSignOut}
          testID="btn-logout"
        >
          <Text style={styles.logoutIcon}>⏻</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyContainer} testID="empty-state">
      <Text style={styles.emptyIcon}>🃏</Text>
      <Text style={styles.emptyTitle}>No active games</Text>
      <Text style={styles.emptySubtitle}>
        Create a game to get started!
      </Text>
    </View>
  );
}

// ─── LobbyScreen ─────────────────────────────────────────────────────────────

export default function LobbyScreen() {
  const { user, chips, signOut, session } = useAuthStore();
  const username =
    (user?.user_metadata?.["username"] as string | undefined) ?? "Player";
  const accessToken = session?.access_token ?? null;

  const [games, setGames] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // ── REST fetch ─────────────────────────────────────────────────────────────

  const loadGames = useCallback(async () => {
    try {
      const data = await fetchGames(accessToken);
      setGames(data);
      setError(null);
    } catch {
      setError("Could not load games. Pull down to retry.");
    }
  }, [accessToken]);

  // Initial load + auto-poll every POLL_INTERVAL_MS.
  useEffect(() => {
    let mounted = true;

    (async () => {
      await loadGames();
      if (mounted) setLoading(false);
    })();

    const timer = setInterval(loadGames, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [loadGames]);

  // ── Socket events ──────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = connectSocket(accessToken);

    const onRoomListUpdated = (rooms: GameRoom[]) => setGames(rooms);
    const onRoomJoined = ({ roomId }: RoomJoinedPayload) => {
      setJoiningId(null);
      router.push(`/(app)/game/${roomId}`);
    };

    socket.on("room-list-updated", onRoomListUpdated);
    socket.on("room-joined", onRoomJoined);

    return () => {
      socket.off("room-list-updated", onRoomListUpdated);
      socket.off("room-joined", onRoomJoined);
    };
  }, [accessToken]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadGames();
    setRefreshing(false);
  };

  const handleJoin = (roomId: string) => {
    setJoiningId(roomId);
    getSocket().emit("join-room", { roomId });
  };

  // ── Loading screen ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered} testID="loading-screen">
        <ActivityIndicator color="#ffd700" size="large" testID="loading-indicator" />
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hide the Stack layout's generic header; we render our own. */}
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        style={styles.list}
        contentContainerStyle={
          games.length === 0 ? styles.listContentEmpty : styles.listContent
        }
        testID="game-list"
        data={games}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GameCard
            game={item}
            joining={joiningId === item.id}
            onJoin={() => handleJoin(item.id)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ffd700"
            testID="refresh-control"
          />
        }
        ListHeaderComponent={
          <>
            <LobbyHeader
              username={username}
              chips={chips}
              onSignOut={signOut}
            />
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Active Games</Text>
              <Pressable
                style={styles.createBtn}
                onPress={() => router.push("/(app)/create-game")}
                testID="btn-create"
              >
                <Text style={styles.createBtnText}>+ Create Game</Text>
              </Pressable>
            </View>
            {error ? (
              <Text style={styles.errorBanner} testID="error-message">
                {error}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={<EmptyState />}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Full-screen loading
  centered: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },

  // List
  list: { flex: 1, backgroundColor: "#1a1a2e" },
  listContent: { paddingBottom: 32 },
  listContentEmpty: { flexGrow: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
    backgroundColor: "#16213e",
    borderBottomWidth: 1,
    borderBottomColor: "#2d3a56",
  },
  headerInfo: { gap: 2 },
  welcome: { fontSize: 18, fontWeight: "700", color: "#e2e8f0" },
  chips: { fontSize: 13, color: "#ffd700", fontWeight: "600" },
  headerActions: { flexDirection: "row", gap: 4 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnIcon: { fontSize: 16 },
  logoutBtn: { backgroundColor: "#1e0f0f" },
  logoutIcon: { fontSize: 16, color: "#f87171" },

  // Section
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#ffd700" },
  createBtn: {
    backgroundColor: "#ffd700",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: { color: "#0a3d14", fontSize: 13, fontWeight: "700" },

  // Error
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    color: "#f87171",
    fontSize: 13,
    backgroundColor: "#1e1013",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    textAlign: "center",
  },

  // Card
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: "#16213e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2d3a56",
    padding: 16,
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gameType: { fontSize: 12, color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeOpen: { backgroundColor: "#0d2d15" },
  badgeFull: { backgroundColor: "#2d0d0d" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#e2e8f0" },
  gameName: { fontSize: 17, fontWeight: "700", color: "#e2e8f0" },
  cardMeta: { flexDirection: "row", gap: 16 },
  metaText: { fontSize: 13, color: "#94a3b8" },
  joinBtn: {
    backgroundColor: "#ffd700",
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 4,
  },
  joinBtnDisabled: { opacity: 0.4 },
  joinBtnText: { color: "#0a3d14", fontSize: 14, fontWeight: "700" },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#e2e8f0" },
  emptySubtitle: { fontSize: 14, color: "#94a3b8" },
});
