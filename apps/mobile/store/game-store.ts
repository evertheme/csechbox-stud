/**
 * Zustand game store — client-side game state for the mobile app.
 *
 * Architecture
 * ────────────
 * This store is the single source of truth for all in-progress game data.
 * Socket event handlers update it; React components read from it.
 *
 * Type alignment
 * ──────────────
 * • `Card`      — plain `{ rank, suit }` object from @poker/shared-types.
 *                 JSON-safe, comes directly off the wire.
 * • `GamePhase` — from @poker/game-engine, used by both the engine and server.
 * • `GameType`  — from @poker/game-engine registry (kebab-case variant IDs).
 *
 * The store's own `Player` and `GameState` types are lightweight UI-centric
 * shapes that can be populated from any of the server's socket payloads:
 * `game:state`, `game:player-joined`, `game:player-left`, etc.
 *
 * Derived values
 * ──────────────
 * `isMyTurn`, `canCheck`, `canCall`, `canRaise`, `minRaise`, `maxRaise`, and
 * `availableActions` are recalculated on every write that touches the
 * underlying state.  They live in the store so selectors stay simple.
 *
 * Usage
 * ─────
 *   // Register the current player's identity when they join a room
 *   useGameStore.getState().setMyPlayerId(session.user.id);
 *
 *   // Handle a server game:state event
 *   socketService.on('game:state', (serverState) => {
 *     useGameStore.getState().updateGameState(adaptServerState(serverState));
 *   });
 *
 *   // In a component
 *   const { isMyTurn, availableActions, pot } = useGameStore();
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Card } from "@poker/shared-types";
import type { GamePhase } from "@poker/game-engine";
import type { GameType } from "@poker/game-engine";

// ─── Re-exports (convenience for consumers) ───────────────────────────────────

export type { Card, GameType, GamePhase };

// ─── Domain types ─────────────────────────────────────────────────────────────

/** Antes and bring-in amounts that define a table's betting level. */
export interface Stakes {
  ante: number;
  bringIn: number;
}

/** A player sitting at the table, as tracked by the client. */
export interface Player {
  id: string;
  username: string;
  /** Current chip stack (after antes/bets for this hand). */
  chips: number;
  /** 0-based seat position around the table. */
  seatIndex: number;
  /** This player's visible cards (face-up only for opponents; all for self). */
  cards: Card[];
  /** Amount committed to the pot in the current betting round. */
  currentBet: number;
  /** True once the player has folded their hand. */
  folded: boolean;
  /** True when the player has clicked "Ready" in the pre-game lobby. */
  isReady: boolean;
  /** True when it is currently this player's turn to act. */
  isActive: boolean;
}

/** A game room as seen by the client. */
export interface Room {
  id: string;
  gameType: GameType;
  stakes: Stakes;
  maxPlayers: number;
  players: Player[];
  status: "waiting" | "playing" | "finished";
  /** User ID of the room's creator (host). */
  createdBy: string;
}

/**
 * Client-side game state snapshot, received from the server via
 * `game:state` socket events or derived from incremental updates.
 */
export interface GameState {
  pot: number;
  currentBet: number;
  activePlayerIndex: number;
  phase: GamePhase;
  /** Street name (e.g. "third-street", "fourth-street", …) or empty string. */
  currentStreet: string;
  /**
   * Community cards (five-card variants).  Empty for stud games where each
   * player holds their own board.
   */
  deck: Card[];
}

/** A chat message sent inside a game room. */
export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  /** Unix timestamp in milliseconds. */
  timestamp: number;
}

/** Actions available to the active player this turn. */
export type AvailableAction =
  | "fold"
  | "check"
  | "call"
  | "raise"
  | "bet"
  | "all-in";

// ─── Store interface ──────────────────────────────────────────────────────────

export interface GameStoreState {
  // ── Core data ───────────────────────────────────────────────────────────────

  /** The room the user is currently in, or null if in the lobby. */
  currentRoom: Room | null;

  /** Latest game-state snapshot from the server, or null before a game starts. */
  gameState: GameState | null;

  /** All players currently seated, including the local player. */
  players: Player[];

  /**
   * The Supabase user-ID of the player running this app instance.
   * Set once after authentication via `setMyPlayerId()`.
   */
  myPlayerId: string | null;

  /**
   * Derived reference to the local player's `Player` record from `players`.
   * Kept in sync by every write that touches `players` or `myPlayerId`.
   */
  myPlayer: Player | null;

  // ── Denormalised game scalars ────────────────────────────────────────────────
  // Duplicated from `gameState` for ergonomic component access.

  pot: number;
  currentBet: number;
  activePlayerIndex: number;
  phase: GamePhase;

  /** Cards dealt to the local player (including hole cards). */
  myCards: Card[];

  /** Shared board cards (used in community-card variants; empty in stud). */
  communityCards: Card[];

  /** In-room chat history, newest last. */
  chatMessages: ChatMessage[];

  // ── Derived / computed values ────────────────────────────────────────────────

  /** True when it is the local player's turn to act. */
  isMyTurn: boolean;

  /** Ordered list of legal actions for the local player this turn. */
  availableActions: AvailableAction[];

  /** True when the local player can check (no outstanding bet to call). */
  canCheck: boolean;

  /** True when there is a bet the local player must call to continue. */
  canCall: boolean;

  /** True when the local player has enough chips to raise. */
  canRaise: boolean;

  /** Minimum legal raise amount (currentBet × 2, or 1 if no bet). */
  minRaise: number;

  /** Maximum legal raise amount (all-in: the local player's chip stack). */
  maxRaise: number;

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Register the authenticated user's ID so the store can derive `myPlayer`.
   * Call once after sign-in, before joining any room.
   */
  setMyPlayerId: (id: string) => void;

  /** Replace (or clear) the current room record. */
  setRoom: (room: Room | null) => void;

  /**
   * Apply a full game-state snapshot from the server.
   * Updates all denormalised scalars and recalculates derived values.
   */
  updateGameState: (state: GameState) => void;

  /** Seat a new player. Replaces any existing entry with the same `id`. */
  addPlayer: (player: Player) => void;

  /** Remove a player by ID (e.g. when they disconnect or leave the room). */
  removePlayer: (playerId: string) => void;

  /**
   * Merge partial updates into a player record.
   * Useful for handling incremental server messages (ready-state, chip changes…).
   */
  updatePlayer: (playerId: string, updates: Partial<Omit<Player, "id">>) => void;

  /** Append a chat message to the history. */
  addChatMessage: (message: ChatMessage) => void;

  /**
   * Reset all game state back to initial values.
   * Call when the user leaves a room or the game ends.
   */
  clearGame: () => void;

  /**
   * Buy-in amounts recorded for the current session (one entry per buy-in).
   * Populated automatically when setRoom is called; extended by recordBuyIn()
   * for each subsequent rebuy during the session.
   */
  sessionBuyIns: number[];

  /** Record an additional buy-in amount (e.g. on rebuy). */
  recordBuyIn: (amount: number) => void;

  /**
   * Replace the local player's private cards.
   * Call when the server sends the `game:deal-hole-cards` event.
   */
  setMyCards: (cards: Card[]) => void;

  /**
   * Directly update the pot total (e.g. when the server sends a
   * `pot-updated` event before a full `game:state` snapshot arrives).
   */
  updatePot: (amount: number) => void;

  /**
   * Record that a player took an action, updating their state optimistically.
   * A full `game:state` from the server will overwrite this shortly after.
   */
  playerActed: (
    playerId: string,
    action: AvailableAction,
    amount?: number,
  ) => void;
}

// ─── Initial values ───────────────────────────────────────────────────────────

const INITIAL_PHASE: GamePhase = "waiting";

const INITIAL_STATE: Pick<
  GameStoreState,
  | "currentRoom"
  | "gameState"
  | "players"
  | "myPlayerId"
  | "myPlayer"
  | "pot"
  | "currentBet"
  | "activePlayerIndex"
  | "phase"
  | "myCards"
  | "communityCards"
  | "chatMessages"
  | "isMyTurn"
  | "availableActions"
  | "canCheck"
  | "canCall"
  | "canRaise"
  | "minRaise"
  | "maxRaise"
  | "sessionBuyIns"
> = {
  currentRoom: null,
  gameState: null,
  players: [],
  myPlayerId: null,
  myPlayer: null,
  pot: 0,
  currentBet: 0,
  activePlayerIndex: 0,
  phase: INITIAL_PHASE,
  myCards: [],
  communityCards: [],
  chatMessages: [],
  isMyTurn: false,
  availableActions: [],
  canCheck: false,
  canCall: false,
  canRaise: false,
  minRaise: 0,
  maxRaise: 0,
  sessionBuyIns: [],
};

// ─── Derived-value calculator ─────────────────────────────────────────────────

interface DerivedContext {
  players: Player[];
  myPlayerId: string | null;
  activePlayerIndex: number;
  currentBet: number;
}

interface DerivedValues {
  myPlayer: Player | null;
  isMyTurn: boolean;
  availableActions: AvailableAction[];
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
}

function computeDerived(ctx: DerivedContext): DerivedValues {
  const myPlayer =
    ctx.myPlayerId !== null
      ? (ctx.players.find((p) => p.id === ctx.myPlayerId) ?? null)
      : null;

  if (!myPlayer || myPlayer.folded) {
    return {
      myPlayer,
      isMyTurn: false,
      availableActions: [],
      canCheck: false,
      canCall: false,
      canRaise: false,
      minRaise: 0,
      maxRaise: 0,
    };
  }

  const myIndex = ctx.players.indexOf(myPlayer);
  const isMyTurn = myIndex === ctx.activePlayerIndex;

  const canCheck = ctx.currentBet === 0 || myPlayer.currentBet >= ctx.currentBet;
  const canCall = ctx.currentBet > 0 && myPlayer.currentBet < ctx.currentBet;
  const callAmount = Math.max(0, ctx.currentBet - myPlayer.currentBet);
  const canRaise = myPlayer.chips > callAmount;
  const minRaise = ctx.currentBet > 0 ? ctx.currentBet * 2 : 1;
  const maxRaise = myPlayer.chips;

  const availableActions: AvailableAction[] = ["fold"];
  if (canCheck) availableActions.push("check");
  if (canCall) availableActions.push("call");
  if (ctx.currentBet === 0 && canRaise) availableActions.push("bet");
  if (ctx.currentBet > 0 && canRaise) availableActions.push("raise");
  if (myPlayer.chips > 0) availableActions.push("all-in");

  return {
    myPlayer,
    isMyTurn,
    availableActions,
    canCheck,
    canCall,
    canRaise,
    minRaise,
    maxRaise,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStoreState>((set, get) => ({
  ...INITIAL_STATE,

  // ── setMyPlayerId ─────────────────────────────────────────────────────────

  setMyPlayerId: (id) => {
    const { players, activePlayerIndex, currentBet } = get();
    const derived = computeDerived({
      players,
      myPlayerId: id,
      activePlayerIndex,
      currentBet,
    });
    set({ myPlayerId: id, ...derived });
  },

  // ── setRoom ───────────────────────────────────────────────────────────────

  setRoom: (room) => {
    set({ currentRoom: room });

    if (!room) {
      set({ sessionBuyIns: [] });
      return;
    }

    // Seed the players array from the room snapshot.
    const { myPlayerId, activePlayerIndex, currentBet } = get();
    const derived = computeDerived({
      players: room.players,
      myPlayerId,
      activePlayerIndex,
      currentBet,
    });

    // Record the player's starting stack as the first buy-in for this session.
    const myPlayerInRoom = myPlayerId
      ? room.players.find((p) => p.id === myPlayerId) ?? null
      : null;
    const initialBuyIns = myPlayerInRoom ? [myPlayerInRoom.chips] : [];

    set({ players: room.players, sessionBuyIns: initialBuyIns, ...derived });
  },

  // ── updateGameState ───────────────────────────────────────────────────────

  updateGameState: (state) => {
    const { players, myPlayerId } = get();
    const derived = computeDerived({
      players,
      myPlayerId,
      activePlayerIndex: state.activePlayerIndex,
      currentBet: state.currentBet,
    });

    set({
      gameState: state,
      pot: state.pot,
      currentBet: state.currentBet,
      activePlayerIndex: state.activePlayerIndex,
      phase: state.phase,
      ...derived,
    });
  },

  // ── addPlayer ─────────────────────────────────────────────────────────────

  addPlayer: (player) => {
    const { myPlayerId, activePlayerIndex, currentBet } = get();
    const existing = get().players;
    const next = existing.some((p) => p.id === player.id)
      ? existing.map((p) => (p.id === player.id ? player : p))
      : [...existing, player];

    const derived = computeDerived({
      players: next,
      myPlayerId,
      activePlayerIndex,
      currentBet,
    });
    set({ players: next, ...derived });
  },

  // ── removePlayer ──────────────────────────────────────────────────────────

  removePlayer: (playerId) => {
    const { myPlayerId, activePlayerIndex, currentBet } = get();
    const next = get().players.filter((p) => p.id !== playerId);
    const derived = computeDerived({
      players: next,
      myPlayerId,
      activePlayerIndex,
      currentBet,
    });
    set({ players: next, ...derived });
  },

  // ── updatePlayer ──────────────────────────────────────────────────────────

  updatePlayer: (playerId, updates) => {
    const { myPlayerId, activePlayerIndex, currentBet } = get();
    const next = get().players.map((p) =>
      p.id === playerId ? { ...p, ...updates } : p
    );
    const derived = computeDerived({
      players: next,
      myPlayerId,
      activePlayerIndex,
      currentBet,
    });
    set({ players: next, ...derived });
  },

  // ── addChatMessage ────────────────────────────────────────────────────────

  addChatMessage: (message) =>
    set((s) => ({ chatMessages: [...s.chatMessages, message] })),

  // ── recordBuyIn ───────────────────────────────────────────────────────────

  recordBuyIn: (amount) =>
    set((s) => ({ sessionBuyIns: [...s.sessionBuyIns, amount] })),

  // ── clearGame ─────────────────────────────────────────────────────────────

  clearGame: () => {
    // Preserve myPlayerId across game resets — it belongs to the session, not
    // to a specific game.
    const { myPlayerId } = get();
    set({ ...INITIAL_STATE, myPlayerId });
  },

  // ── setMyCards ────────────────────────────────────────────────────────────

  setMyCards: (cards) => set({ myCards: cards }),

  // ── updatePot ─────────────────────────────────────────────────────────────

  updatePot: (amount) => set({ pot: amount }),

  // ── playerActed ───────────────────────────────────────────────────────────

  playerActed: (playerId, action, amount = 0) => {
    const { myPlayerId, activePlayerIndex, currentBet } = get();

    const next = get().players.map((p): Player => {
      if (p.id !== playerId) return p;

      switch (action) {
        case "fold":
          return { ...p, folded: true, isActive: false };

        case "call": {
          const callCost = Math.min(
            Math.max(0, currentBet - p.currentBet),
            p.chips
          );
          return {
            ...p,
            chips: p.chips - callCost,
            currentBet: p.currentBet + callCost,
          };
        }

        case "bet":
        case "raise": {
          const raiseAmount = amount > 0 ? Math.min(amount, p.chips) : 0;
          return {
            ...p,
            chips: p.chips - raiseAmount,
            currentBet: p.currentBet + raiseAmount,
          };
        }

        case "all-in":
          return {
            ...p,
            currentBet: p.currentBet + p.chips,
            chips: 0,
          };

        default:
          return p;
      }
    });

    const newCurrentBet =
      action === "bet" || action === "raise" || action === "all-in"
        ? Math.max(
            currentBet,
            next.find((p) => p.id === playerId)?.currentBet ?? currentBet
          )
        : currentBet;

    const derived = computeDerived({
      players: next,
      myPlayerId,
      // Advance to the next player (server will send authoritative state soon).
      activePlayerIndex:
        next.length > 0
          ? (activePlayerIndex + 1) % next.length
          : activePlayerIndex,
      currentBet: newCurrentBet,
    });

    set({
      players: next,
      currentBet: newCurrentBet,
      ...derived,
    });
  },
}));

// ─── Selectors (convenience hooks for common derived reads) ───────────────────

/**
 * Returns the local player's available actions, or an empty array when it
 * is not their turn.
 *
 * Uses shallow equality so the hook only triggers re-renders when the
 * action list actually changes content, not just reference.
 *
 * @example
 * const actions = useMyActions();
 * // ["fold", "call", "raise"] or []
 */
export function useMyActions(): AvailableAction[] {
  return useGameStore(useShallow((s) => (s.isMyTurn ? s.availableActions : [])));
}

/**
 * Returns a shallow snapshot of the game scalars needed by the action bar.
 *
 * The returned object is shallowly compared between renders so this hook
 * only triggers re-renders when one of the scalar values actually changes.
 */
export function useActionBarState() {
  return useGameStore(
    useShallow((s) => ({
      isMyTurn: s.isMyTurn,
      canCheck: s.canCheck,
      canCall: s.canCall,
      canRaise: s.canRaise,
      minRaise: s.minRaise,
      maxRaise: s.maxRaise,
      currentBet: s.currentBet,
      pot: s.pot,
      myChips: s.myPlayer?.chips ?? 0,
    }))
  );
}
