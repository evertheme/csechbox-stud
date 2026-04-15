/**
 * GamePlayScreen — main poker gameplay screen.
 *
 * Architecture
 * ────────────
 * • Socket events → Zustand `game-store` via `useGameSocket()` hook.
 * • Components read from the store via selectors.
 * • Transient UI state (winner overlay, pause menu, hand-strength text,
 *   reconnection overlay, dealer position, action labels) lives in local state.
 *
 * Overlays (z-order, highest first)
 * ──────────────────────────────────
 * 1. Winner banner (game over)
 * 2. Reconnecting overlay (socket lost)
 * 3. Pause menu
 * 4. Main game layout
 *
 * Turn timer
 * ──────────
 * ActionPanel handles its own countdown.  When it fires `onTimeout` we
 * emit an auto-fold.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useShallow } from "zustand/react/shallow";

import { useAuthStore } from "../../../store/auth-store";
import { useSettingsStore } from "../../../store/settings-store";
import { useGameStore } from "../../../store/game-store";
import { useGameSocket } from "../../../hooks/useGameSocket";
import { socketService } from "../../../lib/socket-service";
import { getSocket } from "../../../lib/socket";
import { GAME_REGISTRY } from "../../../lib/gameRegistry";

import { GameTable, type TablePlayer } from "../../../components/game/GameTable";
import { CardView } from "../../../components/game/CardView";
import { ActionPanel } from "../../../components/game/ActionPanel";
import { RaiseSlider } from "../../../components/game/RaiseSlider";
import { ChatBox } from "../../../components/game/ChatBox";
import { HandStrengthIndicator } from "../../../components/game/HandStrengthIndicator";

import type { Card, WinnerInfo, WinnerDeclaredPayload } from "../../../types/poker";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_LABEL_DURATION_MS = 2_500;
const GAME_STATE_TIMEOUT_MS    = 6_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function variantName(gameType: string): string {
  return GAME_REGISTRY.find((v) => v.id === gameType)?.name ?? gameType;
}

function actionToLabel(
  action: string,
  amount?: number | null
): string {
  switch (action) {
    case "fold":   return "Fold";
    case "check":  return "Check";
    case "call":   return `Call $${amount ?? ""}`;
    case "raise":  return `Raise $${amount ?? ""}`;
    case "bet":    return `Bet $${amount ?? ""}`;
    case "all-in": return "All-In!";
    default:       return action;
  }
}

// ─── WinnerBanner (full-screen overlay) ───────────────────────────────────────

function WinnerBanner({
  winner,
  currentUserId,
  onDismiss,
}: {
  winner: WinnerInfo;
  currentUserId: string;
  onDismiss: () => void;
}) {
  const isMe = winner.playerId === currentUserId;
  const bounceAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.spring(bounceAnim, {
      toValue: 1,
      tension: 80,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [bounceAnim]);

  return (
    <View style={styles.winnerOverlay} testID="winner-banner">
      <Animated.View style={[styles.winnerCard, { transform: [{ scale: bounceAnim }] }]}>
        <Text style={styles.winnerEmoji}>{isMe ? "🏆" : "🃏"}</Text>
        <Text style={styles.winnerTitle}>
          {isMe ? "You Won!" : `${winner.username} Wins!`}
        </Text>
        <Text style={styles.winnerAmount}>
          +${winner.amount.toLocaleString()}
        </Text>
        {winner.handDescription && (
          <Text style={styles.winnerHand}>{winner.handDescription}</Text>
        )}
        <Pressable
          style={styles.winnerDismiss}
          onPress={onDismiss}
          testID="btn-winner-dismiss"
        >
          <Text style={styles.winnerDismissText}>Back to Lobby</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── PauseMenu ────────────────────────────────────────────────────────────────

interface PauseMenuProps {
  visible: boolean;
  onResume: () => void;
  onSettings: () => void;
  onLeave: () => void;
  gameType: string;
  roomId: string;
}

function PauseMenu({
  visible,
  onResume,
  onSettings,
  onLeave,
  gameType,
  roomId,
}: PauseMenuProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onResume}
      testID="pause-menu-modal"
    >
      <View style={styles.pauseOverlay}>
        <View style={styles.pauseCard} testID="pause-menu">
          <Text style={styles.pauseTitle}>Game Paused</Text>
          <Text style={styles.pauseSubtitle}>
            {variantName(gameType)} · Room {roomId.slice(0, 8)}
          </Text>

          <Pressable style={styles.pauseBtn} onPress={onResume} testID="btn-resume">
            <Text style={styles.pauseBtnText}>▶  Resume</Text>
          </Pressable>

          <Pressable style={styles.pauseBtn} onPress={onSettings} testID="btn-pause-settings">
            <Text style={styles.pauseBtnText}>⚙  Settings</Text>
          </Pressable>

          <Pressable
            style={[styles.pauseBtn, styles.pauseBtnDanger]}
            onPress={onLeave}
            testID="btn-leave-from-pause"
          >
            <Text style={[styles.pauseBtnText, styles.pauseBtnTextDanger]}>
              🚪  Leave Game
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── ReconnectingOverlay ──────────────────────────────────────────────────────

function ReconnectingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.reconnectOverlay} testID="reconnecting-overlay" pointerEvents="none">
      <ActivityIndicator color="#ffd700" size="large" />
      <Text style={styles.reconnectText}>Reconnecting…</Text>
    </View>
  );
}

// ─── GamePlayScreen ───────────────────────────────────────────────────────────

export default function GamePlayScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user }   = useAuthStore();
  const currentUserId = user?.id ?? "";

  const { showHandStrength } = useSettingsStore(
    useShallow((s) => ({ showHandStrength: s.showHandStrength ?? true }))
  );

  // ── Game store reads ────────────────────────────────────────────────────────
  const {
    players,
    myPlayer,
    myCards,
    pot,
    currentBet,
    phase,
    isMyTurn,
    canCheck,
    canCall,
    canRaise,
    minRaise,
    maxRaise,
    chatMessages,
    setMyPlayerId,
  } = useGameStore(
    useShallow((s) => ({
      players:           s.players,
      myPlayer:          s.myPlayer,
      myCards:           s.myCards,
      pot:               s.pot,
      currentBet:        s.currentBet,
      phase:             s.phase,
      isMyTurn:          s.isMyTurn,
      canCheck:          s.canCheck,
      canCall:           s.canCall,
      canRaise:          s.canRaise,
      minRaise:          s.minRaise,
      maxRaise:          s.maxRaise,
      chatMessages:      s.chatMessages,
      setMyPlayerId:     s.setMyPlayerId,
    }))
  );

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);
  const [winner, setWinner]             = useState<WinnerInfo | null>(null);
  const [handStrength, setHandStrength] = useState<string | null>(null);
  const [dealerPlayerId, setDealerPlayerId] = useState<string>("");
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [actionLabels, setActionLabels] =
    useState<Record<string, string>>({});

  const actionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const timeoutRef   = useRef<ReturnType<typeof setTimeout>>();

  // ── Register player identity in the store ──────────────────────────────────
  useEffect(() => {
    if (currentUserId) setMyPlayerId(currentUserId);
  }, [currentUserId, setMyPlayerId]);

  // ── Wire socket events → store via the hook ────────────────────────────────
  const { isConnected } = useGameSocket({
    onGameStarted: () => setLoading(false),
    onWinner: (w) => {
      setWinner(w);
    },
    onShowdown: (results) => {
      // Find the local player's result and display their hand description.
      const me = results?.find((r) => r.playerId === currentUserId);
      if (me?.handDescription) setHandStrength(me.handDescription);
    },
    onError: (msg) => setError(msg),
  });

  // ── Request initial game state on mount ────────────────────────────────────
  useEffect(() => {
    const rawSocket = getSocket();
    rawSocket.emit("get-game-state", { roomId });

    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      setError("Could not load the game. Go back and try again.");
    }, GAME_STATE_TIMEOUT_MS);

    const onGameState = (state: { dealerPlayerId?: string }) => {
      clearTimeout(timeoutRef.current);
      setLoading(false);
      setError(null);
      if (state?.dealerPlayerId) setDealerPlayerId(state.dealerPlayerId);
    };

    const onPlayerActed = ({
      playerId,
      action,
      amount,
    }: {
      playerId: string;
      action: string;
      amount?: number;
    }) => {
      showActionLabel(playerId, actionToLabel(action, amount));
    };

    const onWinnerDeclared = ({ winner: w }: WinnerDeclaredPayload) => {
      setWinner(w);
    };

    rawSocket.on("game-state", onGameState);
    rawSocket.on("player-acted", onPlayerActed);
    rawSocket.on("winner-declared", onWinnerDeclared);

    return () => {
      clearTimeout(timeoutRef.current);
      Object.values(actionTimers.current).forEach(clearTimeout);
      rawSocket.off("game-state", onGameState);
      rawSocket.off("player-acted", onPlayerActed);
      rawSocket.off("winner-declared", onWinnerDeclared);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Also clear loading when players arrive from the store (reconnection path).
  useEffect(() => {
    if (players.length > 0) {
      clearTimeout(timeoutRef.current);
      setLoading(false);
      setError(null);
    }
  }, [players]);

  // ── Action label helper ────────────────────────────────────────────────────

  const showActionLabel = useCallback((playerId: string, label: string) => {
    clearTimeout(actionTimers.current[playerId]);
    setActionLabels((prev) => ({ ...prev, [playerId]: label }));
    actionTimers.current[playerId] = setTimeout(() => {
      setActionLabels((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
    }, ACTION_LABEL_DURATION_MS);
  }, []);

  // ── Player actions ─────────────────────────────────────────────────────────

  const emitAction = useCallback(
    (action: string, amount?: number) => {
      const payload = {
        roomId,
        action,
        ...(amount !== undefined ? { amount } : {}),
      };
      socketService.emit("player-action", payload);
      getSocket().emit("player-action", payload);
    },
    [roomId]
  );

  const handleFold    = useCallback(() => emitAction("fold"),          [emitAction]);
  const handleCheck   = useCallback(() => emitAction("check"),         [emitAction]);
  const handleCall    = useCallback(() => {
    const callAmount = Math.max(0, currentBet - (myPlayer?.currentBet ?? 0));
    emitAction("call", callAmount);
  }, [emitAction, currentBet, myPlayer]);
  const handleTimeout = useCallback(() => emitAction("fold"),          [emitAction]);

  const handleRaiseConfirm = useCallback(
    (amount: number) => {
      emitAction(currentBet > 0 ? "raise" : "bet", amount);
      setShowRaiseSlider(false);
    },
    [emitAction, currentBet]
  );

  const handleChatSend = useCallback(
    (text: string) => {
      getSocket().emit("chat-message", { roomId, message: text });
    },
    [roomId]
  );

  // ── Leave game ─────────────────────────────────────────────────────────────

  const handleLeave = useCallback(() => {
    Alert.alert(
      "Leave Game",
      "Leave game? You'll lose your seat.",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            socketService.leaveRoom(roomId);
            getSocket().emit("leave-room", { roomId });
            router.replace("/(app)/lobby");
          },
        },
      ]
    );
  }, [roomId]);

  const handleExitPress = useCallback(() => {
    setShowPauseMenu(false);
    handleLeave();
  }, [handleLeave]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const callAmount = Math.max(0, currentBet - (myPlayer?.currentBet ?? 0));
  const isRaise    = callAmount > 0;
  const opponents  = players.filter((p) => p.id !== currentUserId);

  const tableOpponents: TablePlayer[] = opponents.map((p) => ({
    id:          p.id,
    username:    p.username,
    chips:       p.chips,
    cards:       p.cards as Card[],
    currentBet:  p.currentBet,
    isFolded:    p.folded,
    isActive:    p.isActive,
    isDealer:    p.id === dealerPlayerId,
    actionLabel: actionLabels[p.id] ?? null,
  }));

  const gameType = useGameStore.getState().currentRoom?.gameType ?? "";
  const title    = variantName(gameType);

  // ── Render guards ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered} testID="loading-screen">
        <Stack.Screen options={{ title: "Loading…", headerShown: false }} />
        <ActivityIndicator color="#ffd700" size="large" testID="loading-indicator" />
        <Text style={styles.loadingText}>Dealing cards…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered} testID="error-screen">
        <Stack.Screen options={{ title: "Error", headerShown: false }} />
        <Text style={styles.errorText} testID="error-message">{error}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()} testID="btn-error-back">
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Full game layout ───────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} testID="game-screen">
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Winner overlay ────────────────────────────────────────── */}
      {winner && (
        <WinnerBanner
          winner={winner}
          currentUserId={currentUserId}
          onDismiss={() => {
            setWinner(null);
            router.replace("/(app)/lobby");
          }}
        />
      )}

      {/* ── Reconnecting overlay ──────────────────────────────────── */}
      <ReconnectingOverlay visible={!isConnected} />

      {/* ── Pause menu ────────────────────────────────────────────── */}
      <PauseMenu
        visible={showPauseMenu}
        onResume={() => setShowPauseMenu(false)}
        onSettings={() => {
          setShowPauseMenu(false);
          router.push("/(app)/settings");
        }}
        onLeave={handleExitPress}
        gameType={gameType}
        roomId={roomId ?? ""}
      />

      {/* ── Header bar ────────────────────────────────────────────── */}
      <View style={styles.header} testID="game-header">
        <Pressable
          style={styles.headerBtn}
          onPress={() => setShowPauseMenu(true)}
          testID="btn-menu"
          accessibilityLabel="Open menu"
        >
          <Text style={styles.headerBtnText}>≡</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || "Poker"}
          </Text>
          <Text style={styles.headerPot} testID="header-pot">
            {`Pot: $${pot.toLocaleString()}`}
          </Text>
        </View>

        <Pressable
          style={[styles.headerBtn, styles.headerBtnClose]}
          onPress={handleLeave}
          testID="btn-exit"
          accessibilityLabel="Leave game"
        >
          <Text style={styles.headerBtnText}>✕</Text>
        </Pressable>
      </View>

      {/* ── Game table (opponent seats + felt oval) ───────────────── */}
      <GameTable
        opponents={tableOpponents}
        pot={pot}
        currentBet={currentBet}
        streetLabel={
          useGameStore.getState().gameState?.currentStreet ?? ""
        }
        testID="game-table"
      />

      {/* ── My cards & stats ──────────────────────────────────────── */}
      <View style={styles.myArea} testID="my-area">
        <View style={styles.myHeader}>
          <Text style={styles.myName} numberOfLines={1}>
            {myPlayer?.username ?? user?.email ?? "You"}
          </Text>
          <Text style={styles.myChips} testID="my-chips">
            {`$${(myPlayer?.chips ?? 0).toLocaleString()}`}
          </Text>
          {myPlayer?.folded && (
            <Text style={styles.myFoldedLabel} testID="my-folded">FOLDED</Text>
          )}
          {myPlayer?.isActive && !myPlayer.folded && (
            <View style={styles.myTurnBadge} testID="my-turn-badge">
              <Text style={styles.myTurnText}>⏰ Your Turn</Text>
            </View>
          )}
          {myPlayer?.id === dealerPlayerId && (
            <View style={styles.myDealerChip} testID="my-dealer-chip">
              <Text style={styles.myDealerText}>D</Text>
            </View>
          )}
        </View>

        {/* My cards — show store myCards (private) merged with player's public cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.myCards}
          testID="my-cards"
        >
          {(myCards.length > 0 ? myCards : (myPlayer?.cards ?? []) as Card[]).map(
            (card, i) => (
              <CardView
                key={i}
                card={card as Card}
                size="lg"
                testID={`my-card-${i}`}
              />
            )
          )}
        </ScrollView>

        {myPlayer && myPlayer.currentBet > 0 && (
          <Text style={styles.myBet} testID="my-current-bet">
            Bet: ${myPlayer.currentBet.toLocaleString()}
          </Text>
        )}
      </View>

      {/* ── Hand strength ─────────────────────────────────────────── */}
      <HandStrengthIndicator
        description={handStrength}
        visible={showHandStrength}
        testID="hand-strength"
      />

      {/* ── Action panel or raise slider ──────────────────────────── */}
      {myPlayer && !myPlayer.folded && phase !== "waiting" && (
        showRaiseSlider ? (
          <RaiseSlider
            minBet={Math.max(1, minRaise)}
            maxBet={Math.max(1, maxRaise)}
            pot={pot}
            isRaise={isRaise}
            onConfirm={handleRaiseConfirm}
            onCancel={() => setShowRaiseSlider(false)}
            testID="raise-slider"
          />
        ) : (
          <ActionPanel
            isMyTurn={isMyTurn}
            canCheck={canCheck}
            canCall={canCall}
            canRaise={canRaise}
            callAmount={callAmount}
            isRaise={isRaise}
            onFold={handleFold}
            onCheck={handleCheck}
            onCall={handleCall}
            onOpenRaise={() => setShowRaiseSlider(true)}
            onTimeout={handleTimeout}
            testID="action-panel"
          />
        )
      )}

      {/* ── Chat box ──────────────────────────────────────────────── */}
      <ChatBox
        messages={chatMessages}
        currentUserId={currentUserId}
        onSend={handleChatSend}
        testID="chat-box"
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0a1628",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0a1628",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  loadingText: { color: "#94a3b8", fontSize: 14 },
  errorText:   { color: "#f87171", fontSize: 15, textAlign: "center" },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#16213e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3a56",
  },
  backBtnText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },

  // ── Header ──────────────────────────────────────────────────────────────────

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#0d1f36",
    borderBottomWidth: 1,
    borderBottomColor: "#1a3a5c",
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#16213e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2d3a56",
  },
  headerBtnClose: { borderColor: "#7f1d1d", backgroundColor: "#1e0f0f" },
  headerBtnText: {
    fontSize: 18,
    color: "#e2e8f0",
    fontWeight: "700",
    lineHeight: 22,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    color: "#e2e8f0",
    fontWeight: "700",
  },
  headerPot: {
    fontSize: 12,
    color: "#ffd700",
    fontWeight: "600",
  },

  // ── My area (bottom section) ─────────────────────────────────────────────────

  myArea: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#2d3a56",
    gap: 6,
  },
  myHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  myName: {
    fontSize: 13,
    color: "#e2e8f0",
    fontWeight: "700",
    flex: 1,
  },
  myChips: {
    fontSize: 13,
    color: "#ffd700",
    fontWeight: "700",
  },
  myFoldedLabel: {
    fontSize: 11,
    color: "#f87171",
    fontWeight: "800",
  },
  myTurnBadge: {
    backgroundColor: "#14532d",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  myTurnText: { color: "#22c55e", fontSize: 11, fontWeight: "700" },
  myDealerChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ffd700",
    alignItems: "center",
    justifyContent: "center",
  },
  myDealerText: { fontSize: 11, color: "#0a3d14", fontWeight: "900" },
  myCards: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  myBet: {
    fontSize: 11,
    color: "#ffd700",
    fontWeight: "600",
  },

  // ── Winner overlay ───────────────────────────────────────────────────────────

  winnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  winnerCard: {
    backgroundColor: "#0d1b2e",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#ffd700",
    padding: 32,
    alignItems: "center",
    gap: 12,
    width: "100%",
    maxWidth: 340,
  },
  winnerEmoji: { fontSize: 52 },
  winnerTitle: { fontSize: 28, fontWeight: "800", color: "#ffd700" },
  winnerAmount: { fontSize: 22, fontWeight: "700", color: "#22c55e" },
  winnerHand: { fontSize: 14, color: "#94a3b8", textAlign: "center" },
  winnerDismiss: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2d3a56",
  },
  winnerDismissText: { color: "#e2e8f0", fontSize: 15, fontWeight: "600" },

  // ── Pause menu ───────────────────────────────────────────────────────────────

  pauseOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pauseCard: {
    backgroundColor: "#0d1b2e",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    padding: 28,
    width: "100%",
    maxWidth: 320,
    gap: 12,
    alignItems: "stretch",
  },
  pauseTitle: {
    fontSize: 20,
    color: "#e2e8f0",
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 4,
  },
  pauseSubtitle: {
    fontSize: 12,
    color: "#4a5568",
    textAlign: "center",
    marginBottom: 8,
  },
  pauseBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: "#16213e",
    borderWidth: 1,
    borderColor: "#2d3a56",
    alignItems: "center",
  },
  pauseBtnDanger: {
    borderColor: "#7f1d1d",
    backgroundColor: "#1e0f0f",
  },
  pauseBtnText: {
    fontSize: 15,
    color: "#e2e8f0",
    fontWeight: "600",
  },
  pauseBtnTextDanger: { color: "#f87171" },

  // ── Reconnecting overlay ─────────────────────────────────────────────────────

  reconnectOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  reconnectText: {
    fontSize: 14,
    color: "#ffd700",
    fontWeight: "700",
  },
});
