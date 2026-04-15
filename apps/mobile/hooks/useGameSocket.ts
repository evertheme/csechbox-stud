/**
 * useGameSocket — connects live socket events to the Zustand game store.
 *
 * Architecture
 * ────────────
 * The hook runs a single `useEffect` that:
 *   1. Subscribes to all relevant events from the SocketService singleton.
 *   2. Adapts server payloads to the store's local type shapes.
 *   3. Calls the appropriate game-store actions.
 *   4. Fires optional lifecycle callbacks (navigation, toasts, animations).
 *   5. Unsubscribes all listeners on unmount.
 *
 * Event sources
 * ─────────────
 * Two complementary sources are wired together:
 *
 *   • SocketService (lib/socket-service.ts) — the new typed service that
 *     wraps the server's namespaced events (game:state, game:player-joined,
 *     game:action, game:deal-hole-cards, game:showdown, room:list, error).
 *
 *   • getSocket() (lib/socket.ts) — the legacy raw Socket used by existing
 *     screens for app-specific events the server emits under non-namespaced
 *     names (room-state, player-joined, player-left, player-ready,
 *     game-started, player-acted, pot-updated, winner-declared, chat-message,
 *     room-closed, host-changed).
 *
 * Type adapters
 * ─────────────
 * Server payloads use shared-types shapes (PlayerPublic, GameState from
 * @poker/shared-types) or the mobile app's own socket payload types
 * (types/game.ts, types/poker.ts).  Adapter functions at the bottom of this
 * file convert them to the store's Player / GameState shapes before writing
 * to the store.
 *
 * Usage
 * ─────
 *   // In GameRoomScreen / GameScreen — call once at the top of the component.
 *   useGameSocket({
 *     roomId,
 *     onGameStarted: (roomId) => router.replace(`/(app)/game-play/${roomId}`),
 *     onWinner: (winners) => setWinnerBanner(winners),
 *     onRoomClosed: () => router.replace('/(app)/lobby'),
 *     onError: (msg) => Toast.show(msg),
 *   });
 *
 * Note: call `useGameStore.getState().setMyPlayerId(userId)` once after the
 * user signs in so derived values (isMyTurn, myPlayer, myCards) work correctly.
 */

import { useEffect, useRef } from "react";
import { socketService } from "../lib/socket-service";
import { getSocket } from "../lib/socket";
import { useGameStore } from "../store/game-store";
import type { Player, GameState as StoreGameState, Room, ChatMessage } from "../store/game-store";

// Server / shared-type imports for adapter input shapes.
import type { PlayerPublic } from "@poker/shared-types";
import type { GameState as SharedGameState, GameRoom } from "@poker/shared-types";
import type { BettingActionPayload } from "@poker/shared-types";
import type { ShowdownResult } from "@poker/shared-types";

// App-local event payload shapes (used by legacy raw-socket events).
import type {
  RoomPlayer,
  RoomState,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerReadyPayload,
  HostChangedPayload,
  GameStartedPayload,
} from "../types/game";
import type {
  GameState as PokerGameState,
  GamePlayer,
  PlayerActedPayload,
  PotUpdatedPayload,
  ShowdownPayload,
  WinnerDeclaredPayload,
  WinnerInfo,
} from "../types/poker";
import type { AvailableAction } from "../store/game-store";

// ─── Hook options ─────────────────────────────────────────────────────────────

export interface UseGameSocketOptions {
  /**
   * ID of the current room.  Used for event filtering and to populate the
   * Room record in the store when the server sends full room snapshots.
   */
  roomId?: string;

  // ── Lifecycle callbacks ────────────────────────────────────────────────────

  /**
   * Fired when the server emits "game-started".  Typically used to navigate
   * from the waiting room to the gameplay screen.
   */
  onGameStarted?: (roomId: string) => void;

  /**
   * Fired when the server declares a winner / hand is complete.
   * The array may contain multiple winners (split pots, side pots).
   */
  onWinner?: (winners: WinnerInfo[]) => void;

  /**
   * Fired when the current room is closed (host left, server error, etc.).
   * Typically navigates back to the lobby.
   */
  onRoomClosed?: () => void;

  /**
   * Fired when the host changes.  Useful for updating local UI state that
   * tracks host privileges without storing it in the game store.
   */
  onHostChanged?: (hostId: string) => void;

  /**
   * Fired on any "error" socket event.  Use to show a toast or modal.
   */
  onError?: (message: string) => void;

  /**
   * Fired on "showdown" when all players reveal their cards.
   * Useful for triggering reveal animations.
   */
  onShowdown?: (result: ShowdownResult[]) => void;
}

// ─── Public return shape ──────────────────────────────────────────────────────

export interface UseGameSocketReturn {
  /** Whether the underlying socket is currently connected. */
  isConnected: boolean;
}

// ─── Type adapters ────────────────────────────────────────────────────────────

/**
 * Convert a `RoomPlayer` (waiting-room shape from types/game.ts) to the
 * store's `Player` record.
 */
export function adaptRoomPlayer(rp: RoomPlayer): Player {
  return {
    id: rp.userId,
    username: rp.username,
    chips: rp.chips,
    seatIndex: rp.seatIndex,
    cards: [],
    currentBet: 0,
    folded: false,
    isReady: rp.isReady,
    isActive: false,
  };
}

/**
 * Convert a `GamePlayer` (gameplay shape from types/poker.ts) to the
 * store's `Player` record.  Cards that are face-down for opponents will
 * have been omitted by the server already; callers need not filter them.
 */
export function adaptGamePlayer(gp: GamePlayer): Player {
  return {
    id: gp.userId,
    username: gp.username,
    chips: gp.chips,
    seatIndex: gp.seatIndex,
    // The poker.ts Card has a faceUp field; store Card does not — strip it.
    cards: gp.cards.map(({ rank, suit }) => ({ rank, suit })),
    currentBet: gp.currentBet,
    folded: gp.isFolded,
    isReady: false,
    isActive: !gp.isFolded && !gp.isAllIn,
  };
}

/**
 * Convert the server's `PlayerPublic` (from @poker/shared-types) to the
 * store's `Player`.
 */
export function adaptPlayerPublic(pp: PlayerPublic): Player {
  return {
    id: pp.id,
    username: pp.username,
    chips: pp.chipCount,
    seatIndex: pp.seatIndex,
    cards: [],
    currentBet: pp.currentBet,
    folded: pp.status === "folded",
    isReady: false,
    isActive: pp.status === "active",
  };
}

/**
 * Convert a `PokerGameState` (from types/poker.ts, the full game-play snapshot)
 * to the store's `GameState`.
 *
 * @param gs       - Full poker game state from the server.
 * @param players  - Current players list (needed to find activePlayerIndex).
 */
export function adaptPokerGameState(
  gs: PokerGameState,
  players: Player[],
): StoreGameState {
  const activePlayerIndex = gs.activePlayerId
    ? Math.max(0, players.findIndex((p) => p.id === gs.activePlayerId))
    : 0;

  // Map the gameplay status to the engine's GamePhase vocabulary.
  const phaseMap: Record<PokerGameState["status"], StoreGameState["phase"]> = {
    playing: "betting",
    showdown: "showdown",
    finished: "complete",
  };

  return {
    pot: gs.pot,
    currentBet: gs.currentBet,
    activePlayerIndex,
    phase: phaseMap[gs.status] ?? "betting",
    currentStreet: gs.street ?? "",
    deck: [],
  };
}

/**
 * Convert the shared-types server `GameState` to the store's `GameState`.
 * Used when the SocketService fires a `game:state` event.
 */
export function adaptSharedGameState(
  gs: SharedGameState,
  players: Player[],
): StoreGameState {
  const activePlayerIndex = Math.max(
    0,
    players.findIndex((_, idx) => idx === gs.currentPlayerIndex)
  );

  return {
    pot: gs.pots.reduce((sum, p) => sum + p.amount, 0),
    currentBet: 0, // not directly in SharedGameState; server tracks per-player bets
    activePlayerIndex,
    phase: gs.phase,
    currentStreet: "",
    deck: [],
  };
}

/**
 * Adapt a `RoomState` snapshot to a store `Room`.
 * Stakes come as a formatted string from the server ("$1/$2") — we parse it
 * back to numbers for the store; if parsing fails we default to zero.
 */
export function adaptRoomState(rs: RoomState): Room {
  const parseStakes = (s: string): { ante: number; bringIn: number } => {
    // Attempt to parse "$ante/$bringIn" format.
    const match = s.replace(/\$/g, "").split("/");
    const ante = parseFloat(match[0] ?? "0") || 0;
    const bringIn = parseFloat(match[1] ?? "0") || 0;
    return { ante, bringIn };
  };

  return {
    id: rs.roomId,
    // gameType from RoomState may be a display label; store it as-is.
    gameType: rs.gameType as Room["gameType"],
    stakes: parseStakes(rs.stakes),
    maxPlayers: rs.maxPlayers,
    players: rs.players.map(adaptRoomPlayer),
    status: "waiting",
    createdBy: rs.hostId,
  };
}

/**
 * Convert a `GameRoom` (shared-types lobby shape) to a store `Room`.
 */
export function adaptGameRoom(gr: GameRoom): Room {
  return {
    id: gr.id,
    gameType: "seven-card-stud" as Room["gameType"], // lobby rooms may not specify variant
    stakes: { ante: gr.settings.smallBlind, bringIn: gr.settings.bigBlind },
    maxPlayers: gr.maxPlayers,
    players: [],
    status: gr.isStarted ? "playing" : "waiting",
    createdBy: "",
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGameSocket(options: UseGameSocketOptions = {}): UseGameSocketReturn {
  const {
    roomId,
    onGameStarted,
    onWinner,
    onRoomClosed,
    onHostChanged,
    onError,
    onShowdown,
  } = options;

  // Capture callbacks in refs so the effect never needs to re-run when they change.
  const onGameStartedRef = useRef(onGameStarted);
  const onWinnerRef      = useRef(onWinner);
  const onRoomClosedRef  = useRef(onRoomClosed);
  const onHostChangedRef = useRef(onHostChanged);
  const onErrorRef       = useRef(onError);
  const onShowdownRef    = useRef(onShowdown);

  useEffect(() => {
    onGameStartedRef.current = onGameStarted;
    onWinnerRef.current      = onWinner;
    onRoomClosedRef.current  = onRoomClosed;
    onHostChangedRef.current = onHostChanged;
    onErrorRef.current       = onError;
    onShowdownRef.current    = onShowdown;
  });

  useEffect(() => {
    const store = useGameStore.getState;
    const rawSocket = getSocket();

    // ── Helper: read store state snapshot ───────────────────────────────────
    const getPlayers = () => useGameStore.getState().players;

    // ────────────────────────────────────────────────────────────────────────
    // LEGACY RAW-SOCKET HANDLERS
    // These match the event names used by the existing GameRoomScreen and
    // GamePlayScreen, keeping backward compatibility while the new SocketService
    // layer handles the authoritative server events below.
    // ────────────────────────────────────────────────────────────────────────

    // Full room snapshot (initial load or refresh).
    const onRoomState = (rs: RoomState) => {
      const room = adaptRoomState(rs);
      store().setRoom(room);
    };

    // A player joined a waiting-room seat.
    const onPlayerJoined = ({ player }: PlayerJoinedPayload) => {
      store().addPlayer(adaptRoomPlayer(player));
    };

    // A player left the room.
    const onPlayerLeft = ({ userId }: PlayerLeftPayload) => {
      store().removePlayer(userId);
    };

    // A player's ready status changed.
    const onPlayerReady = ({ userId, isReady }: PlayerReadyPayload) => {
      store().updatePlayer(userId, { isReady });
    };

    // Game started — navigate to the gameplay screen.
    const onGameStarted = ({ roomId: startedRoomId }: GameStartedPayload) => {
      // Transition the store phase so derived values update immediately.
      store().updateGameState({
        ...useGameStore.getState().gameState ?? {
          pot: 0,
          currentBet: 0,
          activePlayerIndex: 0,
          currentStreet: "",
          deck: [],
        },
        phase: "dealing",
      });
      onGameStartedRef.current?.(startedRoomId);
    };

    // Host ownership transferred.
    const onHostChanged = ({ hostId }: HostChangedPayload) => {
      store().setRoom(
        store().currentRoom
          ? { ...store().currentRoom!, createdBy: hostId }
          : null
      );
      onHostChangedRef.current?.(hostId);
    };

    // Room was closed by the host or server.
    const onRoomClosed = () => {
      store().clearGame();
      onRoomClosedRef.current?.();
    };

    // Full game-state update during play.
    const onGameState = (gs: PokerGameState) => {
      const players = gs.players.map(adaptGamePlayer);

      // Bulk-update all player records.
      for (const player of players) {
        store().addPlayer(player);
      }

      store().updateGameState(adaptPokerGameState(gs, players));
    };

    // A player took an action (incremental update).
    const onPlayerActed = ({ playerId, action, amount, gameState }: PlayerActedPayload) => {
      store().playerActed(playerId, action as AvailableAction, amount);

      // Immediately apply the authoritative game state the server attached.
      if (gameState) {
        const players = gameState.players.map(adaptGamePlayer);
        for (const player of players) {
          store().addPlayer(player);
        }
        store().updateGameState(adaptPokerGameState(gameState, players));
      }
    };

    // Pot total updated independently (e.g. after a street collect).
    const onPotUpdated = ({ pot }: PotUpdatedPayload) => {
      store().updatePot(pot);
    };

    // Showdown — reveal all cards.
    const onShowdown = ({ gameState }: ShowdownPayload) => {
      if (gameState) {
        const players = gameState.players.map(adaptGamePlayer);
        for (const player of players) {
          store().addPlayer(player);
        }
        store().updateGameState(adaptPokerGameState(gameState, players));
      }
    };

    // Winner declared — hand is over.
    const onWinnerDeclared = ({ winner, gameState }: WinnerDeclaredPayload) => {
      if (gameState) {
        const players = gameState.players.map(adaptGamePlayer);
        for (const player of players) {
          store().addPlayer(player);
        }
        store().updateGameState({
          ...adaptPokerGameState(gameState, players),
          phase: "complete",
        });
      }
      onWinnerRef.current?.([winner]);
    };

    // In-room chat message.
    const onChatMessage = (msg: ChatMessage) => {
      store().addChatMessage(msg);
    };

    // Raw socket error.
    const onRawError = (message: string) => {
      onErrorRef.current?.(message);
    };

    // Register all legacy raw-socket listeners.
    rawSocket.on("room-state",      onRoomState);
    rawSocket.on("player-joined",   onPlayerJoined);
    rawSocket.on("player-left",     onPlayerLeft);
    rawSocket.on("player-ready",    onPlayerReady);
    rawSocket.on("game-started",    onGameStarted);
    rawSocket.on("host-changed",    onHostChanged);
    rawSocket.on("room-closed",     onRoomClosed);
    rawSocket.on("game-state",      onGameState);
    rawSocket.on("player-acted",    onPlayerActed);
    rawSocket.on("pot-updated",     onPotUpdated);
    rawSocket.on("showdown",        onShowdown);
    rawSocket.on("winner-declared", onWinnerDeclared);
    rawSocket.on("chat-message",    onChatMessage);
    rawSocket.on("error",           onRawError);

    // ────────────────────────────────────────────────────────────────────────
    // SOCKET SERVICE HANDLERS (typed server events via SocketService)
    // These complement the legacy events above and handle the server's
    // namespaced events: game:state, game:player-joined, etc.
    // ────────────────────────────────────────────────────────────────────────

    // Typed game state from the server.
    const onServiceGameState = (gs: SharedGameState) => {
      const players = gs.players.map(adaptPlayerPublic);
      for (const player of players) {
        store().addPlayer(player);
      }
      store().updateGameState(adaptSharedGameState(gs, players));
    };

    // Phase change only (no full state).
    const onServicePhaseChange = (phase: SharedGameState["phase"]) => {
      const current = useGameStore.getState().gameState;
      if (current) {
        store().updateGameState({ ...current, phase });
      }
    };

    // Player joined (shared-types PlayerPublic).
    const onServicePlayerJoined = (player: PlayerPublic) => {
      store().addPlayer(adaptPlayerPublic(player));
    };

    // Player left.
    const onServicePlayerLeft = (playerId: string) => {
      store().removePlayer(playerId);
    };

    // Betting action broadcast to all players.
    const onServiceAction = (
      _playerId: string,
      payload: BettingActionPayload,
    ) => {
      // The SocketService 'game:action' event gives us the acting player's ID
      // and the action payload.  We don't have the player ID here (it's the
      // first arg), so we rely on the legacy `player-acted` event above for
      // the store update.  This handler is kept for completeness / logging.
      void payload; // consumed by legacy handler
    };

    // Hole cards dealt to this player.
    const onServiceHoleCards = (cards: import("@poker/shared-types").Card[]) => {
      store().setMyCards(cards);
    };

    // Showdown results from service.
    const onServiceShowdown = (results: ShowdownResult[]) => {
      onShowdownRef.current?.(results);
    };

    // Room list updated (lobby use — not directly relevant in-game but wired).
    const onServiceRoomList = (_rooms: GameRoom[]) => {
      // Nothing to store in-game; lobby screen handles this separately.
    };

    // Service-level error.
    const onServiceError = (message: string) => {
      onErrorRef.current?.(message);
    };

    socketService.on("game:state",          onServiceGameState);
    socketService.on("game:phase-change",    onServicePhaseChange);
    socketService.on("game:player-joined",   onServicePlayerJoined);
    socketService.on("game:player-left",     onServicePlayerLeft);
    socketService.on("game:action",          onServiceAction);
    socketService.on("game:deal-hole-cards", onServiceHoleCards);
    socketService.on("game:showdown",        onServiceShowdown);
    socketService.on("room:list",            onServiceRoomList);
    socketService.on("error",               onServiceError);

    // ── Cleanup ─────────────────────────────────────────────────────────────

    return () => {
      // Remove all legacy raw-socket listeners.
      rawSocket.off("room-state",      onRoomState);
      rawSocket.off("player-joined",   onPlayerJoined);
      rawSocket.off("player-left",     onPlayerLeft);
      rawSocket.off("player-ready",    onPlayerReady);
      rawSocket.off("game-started",    onGameStarted);
      rawSocket.off("host-changed",    onHostChanged);
      rawSocket.off("room-closed",     onRoomClosed);
      rawSocket.off("game-state",      onGameState);
      rawSocket.off("player-acted",    onPlayerActed);
      rawSocket.off("pot-updated",     onPotUpdated);
      rawSocket.off("showdown",        onShowdown);
      rawSocket.off("winner-declared", onWinnerDeclared);
      rawSocket.off("chat-message",    onChatMessage);
      rawSocket.off("error",           onRawError);

      // Remove all SocketService listeners.
      socketService.off("game:state",          onServiceGameState);
      socketService.off("game:phase-change",    onServicePhaseChange);
      socketService.off("game:player-joined",   onServicePlayerJoined);
      socketService.off("game:player-left",     onServicePlayerLeft);
      socketService.off("game:action",          onServiceAction);
      socketService.off("game:deal-hole-cards", onServiceHoleCards);
      socketService.off("game:showdown",        onServiceShowdown);
      socketService.off("room:list",            onServiceRoomList);
      socketService.off("error",               onServiceError);
    };
  // roomId is intentionally excluded from deps — if the roomId changes the
  // screen unmounts and remounts anyway (Expo Router dynamic segments).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isConnected: socketService.isConnected(),
  };
}
