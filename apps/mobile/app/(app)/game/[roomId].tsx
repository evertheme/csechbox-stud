import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../../store/auth-store";
import { getSocket } from "../../../lib/socket";
import { GAME_REGISTRY } from "../../../lib/gameRegistry";
import type {
  GameStartedPayload,
  HostChangedPayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerReadyPayload,
  RoomPlayer,
  RoomState,
} from "../../../types/game";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOM_STATE_TIMEOUT_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lookupVariantName(gameType: string): string {
  return GAME_REGISTRY.find((v) => v.id === gameType)?.name ?? gameType;
}

function buildSeats(state: RoomState) {
  return Array.from({ length: state.maxPlayers }, (_, i) => ({
    seatIndex: i,
    player: state.players.find((p) => p.seatIndex === i) ?? null,
  }));
}

// ─── SeatCard ─────────────────────────────────────────────────────────────────

interface SeatCardProps {
  seatIndex: number;
  player: RoomPlayer | null;
  isMe: boolean;
  isHost: boolean;
}

function SeatCard({ seatIndex, player, isMe, isHost }: SeatCardProps) {
  return (
    <View
      style={[styles.seatCard, isMe && styles.seatCardMe]}
      testID={`seat-card-${seatIndex}`}
    >
      <Text style={styles.seatLabel}>Seat {seatIndex + 1}</Text>

      {player ? (
        <>
          <Text
            style={[styles.playerName, isMe && styles.playerNameMe]}
            testID={`seat-player-name-${seatIndex}`}
            numberOfLines={1}
          >
            {isMe ? "You" : player.username}
          </Text>

          <Text style={styles.playerChips} testID={`seat-chips-${seatIndex}`}>
            ${player.chips.toLocaleString()}
          </Text>

          <View
            style={[
              styles.readyBadge,
              player.isReady ? styles.readyBadgeYes : styles.readyBadgeNo,
            ]}
            testID={`seat-ready-${seatIndex}`}
          >
            <Text style={styles.readyBadgeText}>
              {player.isReady ? "✓ Ready" : "⏳ Wait"}
            </Text>
          </View>

          {isHost && (
            <Text style={styles.hostBadge} testID={`seat-host-${seatIndex}`}>
              👑 Host
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.emptyLabel} testID={`seat-empty-${seatIndex}`}>
          [Empty]
        </Text>
      )}
    </View>
  );
}

// ─── LoadingView ──────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <View style={styles.centered} testID="loading-screen">
      <ActivityIndicator color="#ffd700" size="large" testID="loading-indicator" />
      <Text style={styles.loadingText}>Loading room…</Text>
    </View>
  );
}

// ─── ErrorView ────────────────────────────────────────────────────────────────

function ErrorView({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <View style={styles.centered} testID="error-screen">
      <Text style={styles.errorMessage} testID="error-message">
        {message}
      </Text>
      <Pressable style={styles.backBtn} onPress={onBack} testID="btn-error-back">
        <Text style={styles.backBtnText}>Go Back</Text>
      </Pressable>
    </View>
  );
}

// ─── GameRoomScreen ───────────────────────────────────────────────────────────

export default function GameRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuthStore();
  const currentUserId = user?.id ?? "";

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Derived state ──────────────────────────────────────────────────────────

  const seats = roomState ? buildSeats(roomState) : [];
  const myPlayer = roomState?.players.find((p) => p.userId === currentUserId);
  const isHost = roomState?.hostId === currentUserId;
  const isReady = myPlayer?.isReady ?? false;
  const playerCount = roomState?.players.length ?? 0;
  const allReady =
    playerCount >= 2 && (roomState?.players.every((p) => p.isReady) ?? false);
  const canStart = isHost && allReady;

  // ── Socket event handlers ──────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    // Request initial room snapshot.
    socket.emit("get-room", { roomId });

    // Fail gracefully if the server doesn't respond quickly.
    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      setError("Could not load the room. Please go back and try again.");
    }, ROOM_STATE_TIMEOUT_MS);

    const onRoomState = (state: RoomState) => {
      clearTimeout(timeoutRef.current);
      setRoomState(state);
      setLoading(false);
      setError(null);
    };

    const onPlayerJoined = ({ player }: PlayerJoinedPayload) => {
      setRoomState((prev) =>
        prev ? { ...prev, players: [...prev.players, player] } : prev
      );
    };

    const onPlayerLeft = ({ userId }: PlayerLeftPayload) => {
      setRoomState((prev) =>
        prev
          ? { ...prev, players: prev.players.filter((p) => p.userId !== userId) }
          : prev
      );
    };

    const onPlayerReady = ({ userId, isReady: ready }: PlayerReadyPayload) => {
      setRoomState((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((p) =>
                p.userId === userId ? { ...p, isReady: ready } : p
              ),
            }
          : prev
      );
    };

    const onGameStarted = ({ roomId: startedRoomId }: GameStartedPayload) => {
      router.replace(`/(app)/game-play/${startedRoomId}`);
    };

    const onHostChanged = ({ hostId }: HostChangedPayload) => {
      setRoomState((prev) => (prev ? { ...prev, hostId } : prev));
    };

    const onRoomClosed = () => {
      router.replace("/(app)/lobby");
    };

    socket.on("room-state", onRoomState);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-left", onPlayerLeft);
    socket.on("player-ready", onPlayerReady);
    socket.on("game-started", onGameStarted);
    socket.on("host-changed", onHostChanged);
    socket.on("room-closed", onRoomClosed);

    return () => {
      clearTimeout(timeoutRef.current);
      socket.off("room-state", onRoomState);
      socket.off("player-joined", onPlayerJoined);
      socket.off("player-left", onPlayerLeft);
      socket.off("player-ready", onPlayerReady);
      socket.off("game-started", onGameStarted);
      socket.off("host-changed", onHostChanged);
      socket.off("room-closed", onRoomClosed);
    };
  }, [roomId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleToggleReady = () => {
    getSocket().emit("player-ready", { roomId, isReady: !isReady });
  };

  const handleLeave = () => {
    getSocket().emit("leave-room", { roomId });
    router.back();
  };

  const handleStartGame = () => {
    if (!canStart) return;
    getSocket().emit("start-game", { roomId });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingView />;
  if (error || !roomState) {
    return (
      <ErrorView
        message={error ?? "Room not found."}
        onBack={() => router.back()}
      />
    );
  }

  const variantName = lookupVariantName(roomState.gameType);

  return (
    <>
      <Stack.Screen
        options={{
          title: variantName,
          headerBackTitle: "Lobby",
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {/* ── Room info bar ────────────────────────────────────────────── */}
        <View style={styles.infoBar} testID="info-bar">
          <Text style={styles.infoStakes} testID="stakes-text">
            Stakes: {roomState.stakes}
          </Text>
          <Text style={styles.infoCount} testID="player-count">
            Players: {playerCount}/{roomState.maxPlayers}
          </Text>
        </View>

        {/* ── Seat grid ───────────────────────────────────────────────── */}
        <View style={styles.seatGrid} testID="seat-grid">
          {seats.map(({ seatIndex, player }) => (
            <SeatCard
              key={seatIndex}
              seatIndex={seatIndex}
              player={player}
              isMe={player?.userId === currentUserId}
              isHost={player?.userId === roomState.hostId}
            />
          ))}
        </View>

        {/* ── Room code ───────────────────────────────────────────────── */}
        <Text style={styles.roomCode} testID="room-code">
          Room: {roomId}
        </Text>

        {/* ── Action bar ──────────────────────────────────────────────── */}
        <View style={styles.actionBar} testID="action-bar">
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.readyBtn, isReady && styles.readyBtnActive]}
              onPress={handleToggleReady}
              testID="btn-toggle-ready"
            >
              <Text
                style={[styles.readyBtnText, isReady && styles.readyBtnTextActive]}
              >
                {isReady ? "✓ Ready" : "Not Ready"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.leaveBtn}
              onPress={handleLeave}
              testID="btn-leave"
            >
              <Text style={styles.leaveBtnText}>Leave Room</Text>
            </Pressable>
          </View>

          {isHost && (
            <Pressable
              style={[styles.startBtn, !canStart && styles.startBtnDisabled]}
              onPress={handleStartGame}
              disabled={!canStart}
              accessibilityState={{ disabled: !canStart }}
              testID="btn-start"
            >
              <Text style={styles.startBtnText}>
                {allReady ? "Start Game" : "Waiting for players…"}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SEAT_CARD_SIZE = 148;

const styles = StyleSheet.create({
  // Utility
  centered: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  loadingText: { color: "#94a3b8", fontSize: 14, marginTop: 8 },
  errorMessage: { color: "#f87171", fontSize: 15, textAlign: "center" },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#16213e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3a56",
  },
  backBtnText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },

  // Main scroll
  scroll: { flex: 1, backgroundColor: "#1a1a2e" },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },

  // Info bar
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#16213e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3a56",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
  },
  infoStakes: { color: "#ffd700", fontSize: 14, fontWeight: "600" },
  infoCount: { color: "#94a3b8", fontSize: 14 },

  // Seat grid — two columns
  seatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
  },

  // Individual seat card
  seatCard: {
    width: SEAT_CARD_SIZE,
    minHeight: SEAT_CARD_SIZE,
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    padding: 12,
    gap: 4,
    alignItems: "flex-start",
  },
  seatCardMe: {
    borderColor: "#ffd700",
    backgroundColor: "#1e2a14",
  },
  seatLabel: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  playerName: { fontSize: 15, color: "#e2e8f0", fontWeight: "700" },
  playerNameMe: { color: "#ffd700" },
  playerChips: { fontSize: 13, color: "#94a3b8" },
  readyBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 2,
  },
  readyBadgeYes: { backgroundColor: "#0d3d1e" },
  readyBadgeNo: { backgroundColor: "#2d1f0a" },
  readyBadgeText: { fontSize: 11, color: "#e2e8f0", fontWeight: "600" },
  hostBadge: { fontSize: 11, color: "#ffd700", marginTop: 2 },
  emptyLabel: { fontSize: 13, color: "#2d3a56", fontStyle: "italic" },

  // Room code
  roomCode: {
    fontSize: 12,
    color: "#4a5568",
    textAlign: "center",
    letterSpacing: 1,
  },

  // Action bar
  actionBar: { gap: 10, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 10 },
  readyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    backgroundColor: "#16213e",
    alignItems: "center",
  },
  readyBtnActive: { borderColor: "#22c55e", backgroundColor: "#0d2a14" },
  readyBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  readyBtnTextActive: { color: "#22c55e" },
  leaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#7f1d1d",
    backgroundColor: "#1e0f0f",
    alignItems: "center",
  },
  leaveBtnText: { color: "#f87171", fontSize: 14, fontWeight: "600" },
  startBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: "#ffd700",
    alignItems: "center",
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: "#0a3d14", fontSize: 15, fontWeight: "700" },
});
