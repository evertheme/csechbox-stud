import { useCallback, useEffect, useRef, useState } from "react";
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
import { CardView } from "../../../components/game/CardView";
import { ActionButtons } from "../../../components/game/ActionButtons";
import { BetPanel } from "../../../components/game/BetPanel";
import type {
  Card,
  GamePlayer,
  GameState,
  PlayerActionPayload,
  PlayerActedPayload,
  PotUpdatedPayload,
  ShowdownPayload,
  StreetCompletePayload,
  WinnerDeclaredPayload,
  WinnerInfo,
} from "../../../types/poker";

// ─── Constants ────────────────────────────────────────────────────────────────

const GAME_STATE_TIMEOUT_MS = 5_000;
const ACTION_LABEL_DURATION_MS = 2_500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function variantName(gameType: string): string {
  return GAME_REGISTRY.find((v) => v.id === gameType)?.name ?? gameType;
}

// ─── OpponentCard ─────────────────────────────────────────────────────────────
// Compact display for each opponent seated at the table.

interface OpponentCardProps {
  player: GamePlayer;
  isActive: boolean;
  isDealer: boolean;
  actionLabel: string | null;
}

function OpponentCard({
  player,
  isActive,
  isDealer,
  actionLabel,
}: OpponentCardProps) {
  return (
    <View
      style={[
        styles.opponentCard,
        isActive && styles.opponentCardActive,
        player.isFolded && styles.opponentCardFolded,
      ]}
      testID={`opponent-${player.userId}`}
    >
      {/* Name + dealer chip */}
      <View style={styles.opponentNameRow}>
        {isDealer && (
          <View style={styles.dealerChip}>
            <Text style={styles.dealerText}>D</Text>
          </View>
        )}
        <Text style={styles.opponentName} numberOfLines={1}>
          {player.username}
        </Text>
      </View>

      {/* Chips */}
      <Text style={styles.opponentChips} testID={`opponent-chips-${player.userId}`}>
        ${player.chips.toLocaleString()}
      </Text>

      {/* Current-bet badge */}
      {player.currentBet > 0 && (
        <Text style={styles.opponentBet} testID={`opponent-bet-${player.userId}`}>
          Bet: ${player.currentBet}
        </Text>
      )}

      {/* Cards */}
      <View style={styles.opponentHand}>
        {player.cards.map((card, i) => (
          <CardView
            key={i}
            card={card}
            size="sm"
            testID={`opp-card-${player.userId}-${i}`}
          />
        ))}
      </View>

      {/* Action annotation */}
      {actionLabel && (
        <View style={styles.actionAnnotation} testID={`action-label-${player.userId}`}>
          <Text style={styles.actionAnnotationText}>{actionLabel}</Text>
        </View>
      )}

      {player.isFolded && (
        <View style={styles.foldedOverlay} testID={`folded-${player.userId}`}>
          <Text style={styles.foldedText}>FOLDED</Text>
        </View>
      )}
    </View>
  );
}

// ─── WinnerBanner ─────────────────────────────────────────────────────────────

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
  return (
    <View style={styles.winnerBanner} testID="winner-banner">
      <Text style={styles.winnerTitle}>
        {isMe ? "🏆 You won!" : `${winner.username} wins!`}
      </Text>
      <Text style={styles.winnerAmount}>${winner.amount.toLocaleString()}</Text>
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
    </View>
  );
}

// ─── GamePlayScreen ───────────────────────────────────────────────────────────

export default function GamePlayScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuthStore();
  const currentUserId = user?.id ?? "";

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBetPanel, setShowBetPanel] = useState(false);
  const [winner, setWinner] = useState<WinnerInfo | null>(null);
  /** Map of userId → action label shown temporarily */
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const actionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Derived state ──────────────────────────────────────────────────────────

  const myPlayer = gameState?.players.find((p) => p.userId === currentUserId);
  const opponents =
    gameState?.players.filter((p) => p.userId !== currentUserId) ?? [];

  const isMyTurn =
    gameState?.activePlayerId === currentUserId &&
    !myPlayer?.isFolded &&
    gameState?.status === "playing";

  const callAmount = Math.max(
    0,
    (gameState?.currentBet ?? 0) - (myPlayer?.currentBet ?? 0)
  );
  const canCheck = isMyTurn && callAmount === 0;
  const isRaise = callAmount > 0;

  // Bet panel range
  const minBet = isRaise
    ? (gameState?.currentBet ?? 0) + (gameState?.minRaise ?? 0)
    : gameState?.minRaise ?? 1;
  const maxBet = myPlayer?.chips ?? 0;

  // ── Action label helper ────────────────────────────────────────────────────

  const showActionLabel = useCallback(
    (playerId: string, label: string) => {
      clearTimeout(actionTimers.current[playerId]);
      setActionLabels((prev) => ({ ...prev, [playerId]: label }));
      actionTimers.current[playerId] = setTimeout(() => {
        setActionLabels((prev) => {
          const next = { ...prev };
          delete next[playerId];
          return next;
        });
      }, ACTION_LABEL_DURATION_MS);
    },
    []
  );

  // ── Socket event handlers ──────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket();

    // Request initial snapshot.
    socket.emit("get-game-state", { roomId });

    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      setError("Could not load the game. Please go back and try again.");
    }, GAME_STATE_TIMEOUT_MS);

    const onGameState = (state: GameState) => {
      clearTimeout(timeoutRef.current);
      setGameState(state);
      setLoading(false);
      setError(null);
    };

    const onPlayerActed = ({
      playerId,
      action,
      amount,
      gameState: state,
    }: PlayerActedPayload) => {
      setGameState(state);
      const label =
        action === "fold"
          ? "Fold"
          : action === "check"
          ? "Check"
          : action === "call"
          ? `Call $${amount ?? ""}`
          : action === "raise"
          ? `Raise $${amount ?? ""}`
          : action === "bet"
          ? `Bet $${amount ?? ""}`
          : action === "all-in"
          ? "All-in!"
          : action;
      showActionLabel(playerId, label);
    };

    const onPotUpdated = ({ pot }: PotUpdatedPayload) => {
      setGameState((prev) => (prev ? { ...prev, pot } : prev));
    };

    const onStreetComplete = ({ gameState: state }: StreetCompletePayload) => {
      setGameState(state);
      setShowBetPanel(false);
    };

    const onShowdown = ({ gameState: state }: ShowdownPayload) => {
      setGameState(state);
      setShowBetPanel(false);
    };

    const onWinnerDeclared = ({ winner: w, gameState: state }: WinnerDeclaredPayload) => {
      setGameState(state);
      setWinner(w);
    };

    socket.on("game-state", onGameState);
    socket.on("player-acted", onPlayerActed);
    socket.on("pot-updated", onPotUpdated);
    socket.on("street-complete", onStreetComplete);
    socket.on("showdown", onShowdown);
    socket.on("winner-declared", onWinnerDeclared);

    return () => {
      clearTimeout(timeoutRef.current);
      Object.values(actionTimers.current).forEach(clearTimeout);
      socket.off("game-state", onGameState);
      socket.off("player-acted", onPlayerActed);
      socket.off("pot-updated", onPotUpdated);
      socket.off("street-complete", onStreetComplete);
      socket.off("showdown", onShowdown);
      socket.off("winner-declared", onWinnerDeclared);
    };
  }, [roomId, showActionLabel]);

  // ── Player actions ─────────────────────────────────────────────────────────

  const emitAction = (action: PlayerActionPayload["action"], amount?: number) => {
    const payload: PlayerActionPayload = { roomId, action, ...(amount !== undefined ? { amount } : {}) };
    getSocket().emit("player-action", payload);
  };

  const handleFold = () => emitAction("fold");
  const handleCheck = () => emitAction("check");
  const handleCall = () => emitAction("call", callAmount);

  const handleConfirmBet = (amount: number) => {
    emitAction(isRaise ? "raise" : "bet", amount);
    setShowBetPanel(false);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered} testID="loading-screen">
        <ActivityIndicator color="#ffd700" size="large" testID="loading-indicator" />
        <Text style={styles.loadingText}>Dealing cards…</Text>
      </View>
    );
  }

  if (error || !gameState) {
    return (
      <View style={styles.centered} testID="error-screen">
        <Text style={styles.errorText} testID="error-message">
          {error ?? "Game not found."}
        </Text>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="btn-error-back"
        >
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const title = variantName(gameState.gameType);

  return (
    <>
      <Stack.Screen options={{ title, headerBackTitle: "Lobby" }} />

      {/* Winner overlay */}
      {winner && (
        <WinnerBanner
          winner={winner}
          currentUserId={currentUserId}
          onDismiss={() => router.replace("/(app)/lobby")}
        />
      )}

      {/* Main game layout */}
      <View style={styles.screen} testID="game-screen">
        {/* ── Info bar ──────────────────────────────────────────────────── */}
        <View style={styles.infoBar} testID="info-bar">
          <Text style={styles.infoText} testID="pot-text">
            {`Pot: $${gameState.pot.toLocaleString()}`}
          </Text>
          <Text style={styles.streetBadge} testID="street-text">
            {gameState.street}
          </Text>
          {gameState.currentBet > 0 && (
            <Text style={styles.infoText} testID="current-bet-text">
              {`Bet: $${gameState.currentBet}`}
            </Text>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Opponents ─────────────────────────────────────────────── */}
          {opponents.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.opponentsRow}
              testID="opponents-area"
            >
              {opponents.map((opp) => (
                <OpponentCard
                  key={opp.userId}
                  player={opp}
                  isActive={gameState.activePlayerId === opp.userId}
                  isDealer={gameState.dealerPlayerId === opp.userId}
                  actionLabel={actionLabels[opp.userId] ?? null}
                />
              ))}
            </ScrollView>
          )}

          {/* ── Central pot ───────────────────────────────────────────── */}
          <View style={styles.potArea} testID="pot-area">
            <Text style={styles.potLabel}>POT</Text>
          <Text style={styles.potAmount} testID="pot-display">
            {`$${gameState.pot.toLocaleString()}`}
          </Text>
            {gameState.status === "showdown" && (
              <Text style={styles.showdownLabel} testID="showdown-label">
                SHOWDOWN
              </Text>
            )}
          </View>

          {/* ── Player's hand ──────────────────────────────────────────── */}
          <View style={styles.myHandArea} testID="my-hand-area">
            <View style={styles.myHandHeader}>
              <Text style={styles.myHandLabel}>
                {myPlayer ? "Your Hand" : "Spectating"}
              </Text>
              {myPlayer && isMyTurn && (
                <View style={styles.yourTurnBadge} testID="your-turn-badge">
                  <Text style={styles.yourTurnText}>Your Turn</Text>
                </View>
              )}
              {myPlayer?.isFolded && (
                <Text style={styles.foldedIndicator} testID="my-folded-label">
                  FOLDED
                </Text>
              )}
            </View>

            <View style={styles.myCards} testID="my-cards">
              {myPlayer?.cards.map((card: Card, i: number) => (
                <CardView
                  key={i}
                  card={card}
                  size="lg"
                  testID={`my-card-${i}`}
                />
              ))}
            </View>

            {myPlayer && (
            <Text style={styles.myChips} testID="my-chips-text">
              {`Stack: $${myPlayer.chips.toLocaleString()}${
                myPlayer.currentBet > 0 ? `  ·  Bet: $${myPlayer.currentBet}` : ""
              }`}
            </Text>
            )}
          </View>
        </ScrollView>

        {/* ── Fixed action bar ──────────────────────────────────────────── */}
        {myPlayer && !myPlayer.isFolded && gameState.status === "playing" && (
          <View style={styles.actionBar} testID="action-bar">
            {showBetPanel ? (
              <BetPanel
                minBet={Math.max(1, minBet)}
                maxBet={Math.max(1, maxBet)}
                pot={gameState.pot}
                isRaise={isRaise}
                onConfirm={handleConfirmBet}
                onCancel={() => setShowBetPanel(false)}
              />
            ) : (
              <View style={styles.actionBtns}>
                <ActionButtons
                  isMyTurn={isMyTurn}
                  canCheck={canCheck}
                  callAmount={callAmount}
                  hasBet={myPlayer.currentBet > 0}
                  onFold={handleFold}
                  onCheck={handleCheck}
                  onCall={handleCall}
                  onOpenBetPanel={() => setShowBetPanel(true)}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Utility
  centered: {
    flex: 1,
    backgroundColor: "#0a1628",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  loadingText: { color: "#94a3b8", fontSize: 14 },
  errorText: { color: "#f87171", fontSize: 15, textAlign: "center" },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#16213e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3a56",
  },
  backBtnText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },

  // Screen shell
  screen: { flex: 1, backgroundColor: "#0a1628" },

  // Info bar
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0d1f36",
    borderBottomWidth: 1,
    borderBottomColor: "#1a3a5c",
    gap: 8,
  },
  infoText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  streetBadge: {
    backgroundColor: "#1e3a5f",
    color: "#ffd700",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    textTransform: "uppercase",
  },

  // Main scroll
  scroll: { flex: 1 },
  scrollContent: { gap: 16, paddingBottom: 16 },

  // Opponents
  opponentsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  opponentCard: {
    width: 120,
    backgroundColor: "#16213e",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    padding: 10,
    gap: 4,
    position: "relative",
  },
  opponentCardActive: {
    borderColor: "#ffd700",
    backgroundColor: "#1c2a14",
  },
  opponentCardFolded: { opacity: 0.4 },
  opponentNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dealerChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ffd700",
    alignItems: "center",
    justifyContent: "center",
  },
  dealerText: { fontSize: 10, fontWeight: "900", color: "#0a1628" },
  opponentName: { fontSize: 12, color: "#e2e8f0", fontWeight: "600", flex: 1 },
  opponentChips: { fontSize: 11, color: "#94a3b8" },
  opponentBet: { fontSize: 10, color: "#fcd34d" },
  opponentHand: { flexDirection: "row", gap: 3, marginTop: 4 },
  actionAnnotation: {
    position: "absolute",
    bottom: -8,
    alignSelf: "center",
    backgroundColor: "#0d2f3f",
    borderWidth: 1,
    borderColor: "#0ea5e9",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionAnnotationText: { fontSize: 11, color: "#7dd3fc", fontWeight: "700" },
  foldedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  foldedText: { color: "#f87171", fontSize: 12, fontWeight: "800" },

  // Central pot
  potArea: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 4,
  },
  potLabel: {
    fontSize: 11,
    color: "#4a5568",
    fontWeight: "700",
    letterSpacing: 2,
  },
  potAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffd700",
  },
  showdownLabel: {
    fontSize: 13,
    color: "#f87171",
    fontWeight: "700",
    letterSpacing: 2,
  },

  // My hand
  myHandArea: {
    paddingHorizontal: 16,
    gap: 8,
  },
  myHandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  myHandLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  yourTurnBadge: {
    backgroundColor: "#14532d",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  yourTurnText: { color: "#22c55e", fontSize: 11, fontWeight: "700" },
  foldedIndicator: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "700",
  },
  myCards: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  myChips: { fontSize: 12, color: "#64748b" },

  // Action bar
  actionBar: {
    backgroundColor: "#0d1f36",
    borderTopWidth: 1,
    borderTopColor: "#1a3a5c",
  },
  actionBtns: { padding: 12 },

  // Winner banner
  winnerBanner: {
    position: "absolute",
    inset: 0,
    zIndex: 100,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  winnerTitle: { fontSize: 28, fontWeight: "800", color: "#ffd700" },
  winnerAmount: { fontSize: 22, fontWeight: "700", color: "#e2e8f0" },
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
});
