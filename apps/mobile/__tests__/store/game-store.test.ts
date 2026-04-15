/**
 * Tests for the game store (store/game-store.ts).
 *
 * Strategy
 * ────────
 * • The store is a Zustand singleton.  Each test resets it to a clean state
 *   by calling `useGameStore.setState(INITIAL_STATE)` before running.
 * • We interact entirely through the store's public action API to keep tests
 *   implementation-agnostic.
 * • Derived values (isMyTurn, availableActions, …) are verified indirectly by
 *   checking the store state after mutations that would change them.
 */

import {
  useGameStore,
  type Player,
  type Room,
  type GameState,
  type ChatMessage,
  useMyActions,
  useActionBarState,
} from "../../store/game-store";
import type { GameType } from "../../store/game-store";
import { renderHook, act } from "@testing-library/react-native";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLAYER_A: Player = {
  id: "player-a",
  username: "Alice",
  chips: 1000,
  seatIndex: 0,
  cards: [],
  currentBet: 0,
  folded: false,
  isReady: true,
  isActive: true,
};

const PLAYER_B: Player = {
  id: "player-b",
  username: "Bob",
  chips: 800,
  seatIndex: 1,
  cards: [],
  currentBet: 0,
  folded: false,
  isReady: true,
  isActive: false,
};

const PLAYER_C: Player = {
  id: "player-c",
  username: "Carol",
  chips: 600,
  seatIndex: 2,
  cards: [],
  currentBet: 0,
  folded: false,
  isReady: false,
  isActive: false,
};

const ROOM: Room = {
  id: "room-1",
  gameType: "seven-card-stud" as GameType,
  stakes: { ante: 5, bringIn: 10 },
  maxPlayers: 6,
  players: [PLAYER_A, PLAYER_B],
  status: "waiting",
  createdBy: "player-a",
};

const GAME_STATE: GameState = {
  pot: 50,
  currentBet: 20,
  activePlayerIndex: 0,
  phase: "betting",
  currentStreet: "third-street",
  deck: [],
};

const CHAT_MSG: ChatMessage = {
  id: "msg-1",
  userId: "player-a",
  username: "Alice",
  message: "GL HF!",
  timestamp: 1_700_000_000_000,
};

// ─── Helper: reset store before each test ────────────────────────────────────

function resetStore() {
  useGameStore.setState({
    currentRoom: null,
    gameState: null,
    players: [],
    myPlayerId: null,
    myPlayer: null,
    pot: 0,
    currentBet: 0,
    activePlayerIndex: 0,
    phase: "waiting",
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
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useGameStore — initial state", () => {
  beforeEach(resetStore);

  it("starts with null room and empty players", () => {
    const s = useGameStore.getState();
    expect(s.currentRoom).toBeNull();
    expect(s.players).toEqual([]);
    expect(s.myPlayer).toBeNull();
    expect(s.myPlayerId).toBeNull();
  });

  it("starts with zero pot and currentBet", () => {
    const s = useGameStore.getState();
    expect(s.pot).toBe(0);
    expect(s.currentBet).toBe(0);
  });

  it("starts with all derived values false/empty", () => {
    const s = useGameStore.getState();
    expect(s.isMyTurn).toBe(false);
    expect(s.availableActions).toEqual([]);
    expect(s.canCheck).toBe(false);
    expect(s.canCall).toBe(false);
    expect(s.canRaise).toBe(false);
    expect(s.minRaise).toBe(0);
    expect(s.maxRaise).toBe(0);
  });

  it("starts in 'waiting' phase with empty cards", () => {
    const s = useGameStore.getState();
    expect(s.phase).toBe("waiting");
    expect(s.myCards).toEqual([]);
    expect(s.communityCards).toEqual([]);
    expect(s.chatMessages).toEqual([]);
  });
});

// ─── setMyPlayerId ────────────────────────────────────────────────────────────

describe("setMyPlayerId()", () => {
  beforeEach(resetStore);

  it("stores the player ID", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    expect(useGameStore.getState().myPlayerId).toBe("player-a");
  });

  it("updates myPlayer when matching player is already in the list", () => {
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().setMyPlayerId("player-a");
    expect(useGameStore.getState().myPlayer).toMatchObject({ id: "player-a" });
  });

  it("myPlayer remains null when the player is not yet in the list", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    expect(useGameStore.getState().myPlayer).toBeNull();
  });
});

// ─── setRoom ──────────────────────────────────────────────────────────────────

describe("setRoom()", () => {
  beforeEach(resetStore);

  it("stores the room", () => {
    useGameStore.getState().setRoom(ROOM);
    expect(useGameStore.getState().currentRoom).toEqual(ROOM);
  });

  it("seeds players from room.players", () => {
    useGameStore.getState().setRoom(ROOM);
    expect(useGameStore.getState().players).toHaveLength(2);
    expect(useGameStore.getState().players[0]?.id).toBe("player-a");
  });

  it("updates myPlayer when myPlayerId is already set", () => {
    useGameStore.getState().setMyPlayerId("player-b");
    useGameStore.getState().setRoom(ROOM);
    expect(useGameStore.getState().myPlayer?.id).toBe("player-b");
  });

  it("clears the room when called with null", () => {
    useGameStore.getState().setRoom(ROOM);
    useGameStore.getState().setRoom(null);
    expect(useGameStore.getState().currentRoom).toBeNull();
  });
});

// ─── updateGameState ──────────────────────────────────────────────────────────

describe("updateGameState()", () => {
  beforeEach(resetStore);

  it("updates pot, currentBet, phase, and activePlayerIndex", () => {
    useGameStore.getState().updateGameState(GAME_STATE);
    const s = useGameStore.getState();
    expect(s.pot).toBe(50);
    expect(s.currentBet).toBe(20);
    expect(s.phase).toBe("betting");
    expect(s.activePlayerIndex).toBe(0);
  });

  it("stores the raw gameState snapshot", () => {
    useGameStore.getState().updateGameState(GAME_STATE);
    expect(useGameStore.getState().gameState).toEqual(GAME_STATE);
  });

  it("recalculates isMyTurn based on activePlayerIndex", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);

    // Player A is at index 0; activePlayerIndex = 0 → isMyTurn = true
    useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 0 });
    expect(useGameStore.getState().isMyTurn).toBe(true);

    // Advance to player B at index 1
    useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 1 });
    expect(useGameStore.getState().isMyTurn).toBe(false);
  });

  it("sets canCall when currentBet > myPlayer.currentBet", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer({ ...PLAYER_A, currentBet: 0 });
    useGameStore.getState().addPlayer(PLAYER_B);

    useGameStore.getState().updateGameState({ ...GAME_STATE, currentBet: 20, activePlayerIndex: 0 });
    expect(useGameStore.getState().canCall).toBe(true);
    expect(useGameStore.getState().canCheck).toBe(false);
  });

  it("sets canCheck when currentBet === 0", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);

    useGameStore.getState().updateGameState({ ...GAME_STATE, currentBet: 0, activePlayerIndex: 0 });
    expect(useGameStore.getState().canCheck).toBe(true);
    expect(useGameStore.getState().canCall).toBe(false);
  });
});

// ─── addPlayer ────────────────────────────────────────────────────────────────

describe("addPlayer()", () => {
  beforeEach(resetStore);

  it("adds a new player to the list", () => {
    useGameStore.getState().addPlayer(PLAYER_A);
    expect(useGameStore.getState().players).toHaveLength(1);
    expect(useGameStore.getState().players[0]?.username).toBe("Alice");
  });

  it("replaces an existing player with the same id", () => {
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer({ ...PLAYER_A, chips: 999 });
    expect(useGameStore.getState().players).toHaveLength(1);
    expect(useGameStore.getState().players[0]?.chips).toBe(999);
  });

  it("can add multiple distinct players", () => {
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().addPlayer(PLAYER_C);
    expect(useGameStore.getState().players).toHaveLength(3);
  });

  it("updates myPlayer reference when the added player matches myPlayerId", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    expect(useGameStore.getState().myPlayer?.id).toBe("player-a");
  });
});

// ─── removePlayer ─────────────────────────────────────────────────────────────

describe("removePlayer()", () => {
  beforeEach(() => {
    resetStore();
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
  });

  it("removes the specified player", () => {
    useGameStore.getState().removePlayer("player-a");
    expect(useGameStore.getState().players).toHaveLength(1);
    expect(useGameStore.getState().players[0]?.id).toBe("player-b");
  });

  it("is a no-op for an unknown player id", () => {
    useGameStore.getState().removePlayer("unknown");
    expect(useGameStore.getState().players).toHaveLength(2);
  });

  it("clears myPlayer when the local player is removed", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().removePlayer("player-a");
    expect(useGameStore.getState().myPlayer).toBeNull();
  });
});

// ─── updatePlayer ─────────────────────────────────────────────────────────────

describe("updatePlayer()", () => {
  beforeEach(() => {
    resetStore();
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
  });

  it("merges partial updates into the target player", () => {
    useGameStore.getState().updatePlayer("player-a", { chips: 500, isReady: false });
    const alice = useGameStore.getState().players.find((p) => p.id === "player-a");
    expect(alice?.chips).toBe(500);
    expect(alice?.isReady).toBe(false);
    expect(alice?.username).toBe("Alice"); // unchanged
  });

  it("does not modify other players", () => {
    useGameStore.getState().updatePlayer("player-a", { chips: 1 });
    const bob = useGameStore.getState().players.find((p) => p.id === "player-b");
    expect(bob?.chips).toBe(800);
  });

  it("updates myPlayer when the local player is modified", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().updatePlayer("player-a", { chips: 333 });
    expect(useGameStore.getState().myPlayer?.chips).toBe(333);
  });
});

// ─── addChatMessage ───────────────────────────────────────────────────────────

describe("addChatMessage()", () => {
  beforeEach(resetStore);

  it("appends a message to chatMessages", () => {
    useGameStore.getState().addChatMessage(CHAT_MSG);
    expect(useGameStore.getState().chatMessages).toHaveLength(1);
    expect(useGameStore.getState().chatMessages[0]).toEqual(CHAT_MSG);
  });

  it("preserves insertion order for multiple messages", () => {
    const msg2: ChatMessage = { ...CHAT_MSG, id: "msg-2", message: "gg" };
    useGameStore.getState().addChatMessage(CHAT_MSG);
    useGameStore.getState().addChatMessage(msg2);
    expect(useGameStore.getState().chatMessages[0]?.id).toBe("msg-1");
    expect(useGameStore.getState().chatMessages[1]?.id).toBe("msg-2");
  });
});

// ─── clearGame ────────────────────────────────────────────────────────────────

describe("clearGame()", () => {
  beforeEach(resetStore);

  it("resets all game state to initial values", () => {
    useGameStore.getState().setRoom(ROOM);
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().updateGameState(GAME_STATE);
    useGameStore.getState().addChatMessage(CHAT_MSG);

    useGameStore.getState().clearGame();

    const s = useGameStore.getState();
    expect(s.currentRoom).toBeNull();
    expect(s.gameState).toBeNull();
    expect(s.players).toEqual([]);
    expect(s.pot).toBe(0);
    expect(s.chatMessages).toEqual([]);
    expect(s.isMyTurn).toBe(false);
  });

  it("preserves myPlayerId across clearGame()", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().clearGame();
    expect(useGameStore.getState().myPlayerId).toBe("player-a");
  });
});

// ─── setMyCards ───────────────────────────────────────────────────────────────

describe("setMyCards()", () => {
  beforeEach(resetStore);

  it("replaces myCards with the provided array", () => {
    const cards = [
      { rank: "A" as const, suit: "spades" as const },
      { rank: "K" as const, suit: "hearts" as const },
    ];
    useGameStore.getState().setMyCards(cards);
    expect(useGameStore.getState().myCards).toEqual(cards);
  });

  it("replaces a previous hand on a new deal", () => {
    const hand1 = [{ rank: "2" as const, suit: "clubs" as const }];
    const hand2 = [{ rank: "A" as const, suit: "diamonds" as const }];
    useGameStore.getState().setMyCards(hand1);
    useGameStore.getState().setMyCards(hand2);
    expect(useGameStore.getState().myCards).toEqual(hand2);
  });
});

// ─── updatePot ────────────────────────────────────────────────────────────────

describe("updatePot()", () => {
  beforeEach(resetStore);

  it("updates the pot to the given amount", () => {
    useGameStore.getState().updatePot(250);
    expect(useGameStore.getState().pot).toBe(250);
  });

  it("overwrites a previous pot value", () => {
    useGameStore.getState().updatePot(100);
    useGameStore.getState().updatePot(350);
    expect(useGameStore.getState().pot).toBe(350);
  });
});

// ─── playerActed ─────────────────────────────────────────────────────────────

describe("playerActed()", () => {
  beforeEach(() => {
    resetStore();
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer({ ...PLAYER_A, chips: 1000, currentBet: 0 });
    useGameStore.getState().addPlayer({ ...PLAYER_B, chips: 800 });
    useGameStore.getState().updateGameState(GAME_STATE); // currentBet: 20
  });

  it("fold — marks the player as folded", () => {
    useGameStore.getState().playerActed("player-a", "fold");
    const alice = useGameStore.getState().players.find((p) => p.id === "player-a");
    expect(alice?.folded).toBe(true);
    expect(alice?.isActive).toBe(false);
  });

  it("call — deducts the call amount from chips and raises currentBet", () => {
    // Player A has currentBet: 0, store currentBet: 20 → call cost is 20.
    useGameStore.getState().playerActed("player-a", "call");
    const alice = useGameStore.getState().players.find((p) => p.id === "player-a");
    expect(alice?.chips).toBe(980);
    expect(alice?.currentBet).toBe(20);
  });

  it("raise — deducts the raise amount and updates player currentBet", () => {
    useGameStore.getState().playerActed("player-a", "raise", 40);
    const alice = useGameStore.getState().players.find((p) => p.id === "player-a");
    expect(alice?.chips).toBe(960);
    expect(alice?.currentBet).toBe(40);
  });

  it("bet — same mechanics as raise", () => {
    useGameStore.getState().playerActed("player-a", "bet", 30);
    const alice = useGameStore.getState().players.find((p) => p.id === "player-a");
    expect(alice?.chips).toBe(970);
    expect(alice?.currentBet).toBe(30);
  });

  it("all-in — moves all chips to currentBet", () => {
    useGameStore.getState().playerActed("player-a", "all-in");
    const alice = useGameStore.getState().players.find((p) => p.id === "player-a");
    expect(alice?.chips).toBe(0);
    expect(alice?.currentBet).toBe(1000);
  });

  it("does not modify other players when one player acts", () => {
    useGameStore.getState().playerActed("player-a", "fold");
    const bob = useGameStore.getState().players.find((p) => p.id === "player-b");
    expect(bob?.chips).toBe(800);
    expect(bob?.folded).toBe(false);
  });
});

// ─── Derived: isMyTurn ────────────────────────────────────────────────────────

describe("Derived: isMyTurn", () => {
  beforeEach(resetStore);

  it("is true when activePlayerIndex matches the local player's index", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);   // index 0
    useGameStore.getState().addPlayer(PLAYER_B);   // index 1
    useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 0 });
    expect(useGameStore.getState().isMyTurn).toBe(true);
  });

  it("is false when it is another player's turn", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 1 });
    expect(useGameStore.getState().isMyTurn).toBe(false);
  });

  it("is false when myPlayer has folded", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer({ ...PLAYER_A, folded: true });
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 0 });
    expect(useGameStore.getState().isMyTurn).toBe(false);
  });
});

// ─── Derived: availableActions ────────────────────────────────────────────────

describe("Derived: availableActions", () => {
  beforeEach(resetStore);

  it("includes fold, check, bet, all-in when currentBet === 0", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 0,
      activePlayerIndex: 0,
    });
    const actions = useGameStore.getState().availableActions;
    expect(actions).toContain("fold");
    expect(actions).toContain("check");
    expect(actions).toContain("bet");
    expect(actions).not.toContain("call");
    expect(actions).not.toContain("raise");
  });

  it("includes fold, call, raise, all-in when currentBet > 0", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer({ ...PLAYER_A, currentBet: 0 });
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 20,
      activePlayerIndex: 0,
    });
    const actions = useGameStore.getState().availableActions;
    expect(actions).toContain("fold");
    expect(actions).toContain("call");
    expect(actions).toContain("raise");
    expect(actions).not.toContain("check");
    expect(actions).not.toContain("bet");
  });

  it("is empty when myPlayerId is not set", () => {
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().updateGameState(GAME_STATE);
    expect(useGameStore.getState().availableActions).toEqual([]);
  });
});

// ─── Derived: canCheck / canCall / canRaise ───────────────────────────────────

describe("Derived: canCheck / canCall / canRaise", () => {
  beforeEach(() => {
    resetStore();
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer({ ...PLAYER_A, currentBet: 0, chips: 500 });
    useGameStore.getState().addPlayer(PLAYER_B);
  });

  it("canCheck = true when currentBet is 0", () => {
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 0,
      activePlayerIndex: 0,
    });
    expect(useGameStore.getState().canCheck).toBe(true);
  });

  it("canCall = true when currentBet > myPlayer.currentBet", () => {
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 30,
      activePlayerIndex: 0,
    });
    expect(useGameStore.getState().canCall).toBe(true);
  });

  it("canRaise = true when myPlayer has enough chips", () => {
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 20,
      activePlayerIndex: 0,
    });
    // Player has 500 chips; call is 20 → can raise
    expect(useGameStore.getState().canRaise).toBe(true);
  });

  it("canRaise = false when player is effectively all-in", () => {
    useGameStore.getState().updatePlayer("player-a", { chips: 0 });
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 20,
      activePlayerIndex: 0,
    });
    expect(useGameStore.getState().canRaise).toBe(false);
  });
});

// ─── Derived: minRaise / maxRaise ─────────────────────────────────────────────

describe("Derived: minRaise / maxRaise", () => {
  beforeEach(() => {
    resetStore();
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer({ ...PLAYER_A, chips: 500 });
    useGameStore.getState().addPlayer(PLAYER_B);
  });

  it("minRaise is currentBet × 2 when there is an outstanding bet", () => {
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 20,
      activePlayerIndex: 0,
    });
    expect(useGameStore.getState().minRaise).toBe(40);
  });

  it("minRaise is 1 when currentBet is 0", () => {
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 0,
      activePlayerIndex: 0,
    });
    expect(useGameStore.getState().minRaise).toBe(1);
  });

  it("maxRaise equals the player's chip stack", () => {
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      currentBet: 20,
      activePlayerIndex: 0,
    });
    expect(useGameStore.getState().maxRaise).toBe(500);
  });
});

// ─── Selector hooks ───────────────────────────────────────────────────────────

describe("useMyActions() selector", () => {
  beforeEach(resetStore);

  it("returns availableActions when isMyTurn is true", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({ ...GAME_STATE, currentBet: 0, activePlayerIndex: 0 });

    const { result } = renderHook(() => useMyActions());
    expect(result.current).toContain("check");
    expect(result.current).toContain("bet");
  });

  it("returns empty array when it is not the local player's turn", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 1 });

    const { result } = renderHook(() => useMyActions());
    expect(result.current).toEqual([]);
  });
});

describe("useActionBarState() selector", () => {
  beforeEach(resetStore);

  it("returns correct snapshot of action bar state", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer({ ...PLAYER_A, chips: 750 });
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({
      ...GAME_STATE,
      pot: 100,
      currentBet: 20,
      activePlayerIndex: 0,
    });

    const { result } = renderHook(() => useActionBarState());
    expect(result.current.isMyTurn).toBe(true);
    expect(result.current.canCall).toBe(true);
    expect(result.current.pot).toBe(100);
    expect(result.current.currentBet).toBe(20);
    expect(result.current.myChips).toBe(750);
    expect(result.current.minRaise).toBe(40);
    expect(result.current.maxRaise).toBe(750);
  });

  it("updates reactively when store changes", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().addPlayer(PLAYER_A);
    useGameStore.getState().addPlayer(PLAYER_B);
    useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 1 });

    const { result } = renderHook(() => useActionBarState());
    expect(result.current.isMyTurn).toBe(false);

    act(() => {
      useGameStore.getState().updateGameState({ ...GAME_STATE, activePlayerIndex: 0 });
    });
    expect(result.current.isMyTurn).toBe(true);
  });
});

// ─── Integration: full game flow ──────────────────────────────────────────────

// ─── sessionBuyIns ────────────────────────────────────────────────────────────

describe("sessionBuyIns — initial state", () => {
  beforeEach(resetStore);

  it("starts as an empty array", () => {
    expect(useGameStore.getState().sessionBuyIns).toEqual([]);
  });
});

describe("recordBuyIn()", () => {
  beforeEach(resetStore);

  it("appends the amount to sessionBuyIns", () => {
    useGameStore.getState().recordBuyIn(1000);
    expect(useGameStore.getState().sessionBuyIns).toEqual([1000]);
  });

  it("accumulates multiple rebuys in insertion order", () => {
    useGameStore.getState().recordBuyIn(1000);
    useGameStore.getState().recordBuyIn(500);
    useGameStore.getState().recordBuyIn(750);
    expect(useGameStore.getState().sessionBuyIns).toEqual([1000, 500, 750]);
  });
});

describe("setRoom() — sessionBuyIns", () => {
  beforeEach(resetStore);

  it("records the local player's starting chips as the first buy-in on room join", () => {
    useGameStore.getState().setMyPlayerId("player-a"); // PLAYER_A.chips = 1000
    useGameStore.getState().setRoom(ROOM);
    expect(useGameStore.getState().sessionBuyIns).toEqual([1000]);
  });

  it("records PLAYER_B's chips when that is the local player", () => {
    useGameStore.getState().setMyPlayerId("player-b"); // PLAYER_B.chips = 800
    useGameStore.getState().setRoom(ROOM);
    expect(useGameStore.getState().sessionBuyIns).toEqual([800]);
  });

  it("records an empty array when myPlayerId is not set at join time", () => {
    // myPlayerId not set — can't resolve the local player's chips
    useGameStore.getState().setRoom(ROOM);
    expect(useGameStore.getState().sessionBuyIns).toEqual([]);
  });

  it("records an empty array when the local player is not in the room roster", () => {
    useGameStore.getState().setMyPlayerId("player-unknown");
    useGameStore.getState().setRoom(ROOM);
    expect(useGameStore.getState().sessionBuyIns).toEqual([]);
  });

  it("resets sessionBuyIns to empty when room is cleared", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().setRoom(ROOM);
    useGameStore.getState().recordBuyIn(500); // simulate a rebuy

    useGameStore.getState().setRoom(null);
    expect(useGameStore.getState().sessionBuyIns).toEqual([]);
  });

  it("resets sessionBuyIns when joining a new room after leaving the previous one", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().setRoom(ROOM);
    useGameStore.getState().recordBuyIn(500);

    // Join a fresh room (same player, different room object)
    useGameStore.getState().setRoom({ ...ROOM, id: "room-2" });
    expect(useGameStore.getState().sessionBuyIns).toEqual([1000]); // only the new initial buy-in
  });
});

describe("clearGame() — sessionBuyIns", () => {
  beforeEach(resetStore);

  it("resets sessionBuyIns to empty", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().setRoom(ROOM);
    useGameStore.getState().recordBuyIn(500);

    useGameStore.getState().clearGame();
    expect(useGameStore.getState().sessionBuyIns).toEqual([]);
  });
});

// ─── Integration: full game scenario ──────────────────────────────────────────

describe("Integration: full game scenario", () => {
  beforeEach(resetStore);

  it("correctly tracks a round of betting", () => {
    // Setup
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().setRoom(ROOM);
    useGameStore.getState().setMyCards([
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
    ]);

    // Game starts; server sends state with ante
    useGameStore.getState().updateGameState({
      pot: 15, // 3 players × 5 ante
      currentBet: 10,
      activePlayerIndex: 0,
      phase: "betting",
      currentStreet: "third-street",
      deck: [],
    });

    expect(useGameStore.getState().isMyTurn).toBe(true);
    expect(useGameStore.getState().myCards).toHaveLength(2);

    // Player A calls
    useGameStore.getState().playerActed("player-a", "call");
    const alice = useGameStore.getState().players.find((p) => p.id === "player-a");
    expect(alice?.currentBet).toBe(10);
    expect(alice?.chips).toBe(990);

    // Server confirms with updated state
    useGameStore.getState().updateGameState({
      pot: 25,
      currentBet: 10,
      activePlayerIndex: 1,
      phase: "betting",
      currentStreet: "third-street",
      deck: [],
    });

    expect(useGameStore.getState().isMyTurn).toBe(false);
    expect(useGameStore.getState().pot).toBe(25);
  });

  it("clears the game correctly after the hand ends", () => {
    useGameStore.getState().setMyPlayerId("player-a");
    useGameStore.getState().setRoom(ROOM);
    useGameStore.getState().updateGameState({ ...GAME_STATE, pot: 120, phase: "complete" });
    useGameStore.getState().addChatMessage(CHAT_MSG);

    useGameStore.getState().clearGame();

    const s = useGameStore.getState();
    expect(s.pot).toBe(0);
    expect(s.phase).toBe("waiting");
    expect(s.chatMessages).toHaveLength(0);
    expect(s.myPlayerId).toBe("player-a"); // preserved
  });
});
