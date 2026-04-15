/**
 * Tests for useGameSocket (hooks/useGameSocket.ts)
 *
 * Strategy
 * ────────
 * • Mock socket.io-client so no real I/O occurs.
 * • Mock lib/socket-service and lib/socket as lightweight jest.fn() objects.
 * • Capture registered listeners via `on.mock.calls` so we can fire events
 *   manually without needing a real EventEmitter.
 * • All adapter functions (adaptRoomPlayer, etc.) are tested as pure units.
 * • Hook integration tests drive events through the captured listeners and
 *   verify the resulting Zustand game-store state.
 */

// ─── jest.mock declarations ───────────────────────────────────────────────────
// MUST come before any imports that pull in the mocked modules.
// Variables referenced in factories MUST start with "mock" (Jest hoisting rule).

// Minimal raw socket mock — lifecycle only; listeners captured by the hook.
const mockRawSocketEmit = jest.fn();
const mockRawSocketOn   = jest.fn();
const mockRawSocketOff  = jest.fn();
const mockRawSocketOnce = jest.fn();

// Raw-socket mock — use closure wrappers so the jest.fn() values are read
// at call-time (after assignment), not at factory-execution time (before
// assignment). The jest.mock factory is hoisted before const declarations,
// so direct references would capture `undefined`.
jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    connected: false,
    auth: {},
    emit:              (...a: unknown[]) => mockRawSocketEmit(...a),
    on:                (...a: unknown[]) => mockRawSocketOn(...a),
    off:               (...a: unknown[]) => mockRawSocketOff(...a),
    once:              (...a: unknown[]) => mockRawSocketOnce(...a),
    connect:           jest.fn(),
    disconnect:        jest.fn(),
    removeAllListeners: jest.fn(),
  })),
}));

// Service mock — same closure pattern.
const mockSvcOn           = jest.fn();
const mockSvcOff          = jest.fn();
const mockSvcIsConnected  = jest.fn(() => false);

jest.mock("../../lib/socket-service", () => ({
  socketService: {
    on:          (...a: unknown[]) => mockSvcOn(...a),
    off:         (...a: unknown[]) => mockSvcOff(...a),
    isConnected: ()                => mockSvcIsConnected(),
  },
}));

// getSocket() mock — same pattern.
jest.mock("../../lib/socket", () => ({
  getSocket: jest.fn(() => ({
    connected: false,
    emit:              (...a: unknown[]) => mockRawSocketEmit(...a),
    on:                (...a: unknown[]) => mockRawSocketOn(...a),
    off:               (...a: unknown[]) => mockRawSocketOff(...a),
    once:              (...a: unknown[]) => mockRawSocketOnce(...a),
    connect:           jest.fn(),
    disconnect:        jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  connectSocket:    jest.fn(),
  disconnectSocket: jest.fn(),
  socketService: {
    on:          (...a: unknown[]) => mockSvcOn(...a),
    off:         (...a: unknown[]) => mockSvcOff(...a),
    isConnected: ()                => mockSvcIsConnected(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { renderHook, act } from "@testing-library/react-native";
import {
  useGameSocket,
  adaptRoomPlayer,
  adaptGamePlayer,
  adaptPokerGameState,
  adaptRoomState,
  adaptPlayerPublic,
} from "../../hooks/useGameSocket";
import { useGameStore } from "../../store/game-store";
import type { RoomPlayer, RoomState } from "../../types/game";
import type { GamePlayer, GameState as PokerGameState } from "../../types/poker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROOM_PLAYER: RoomPlayer = {
  userId: "p1",
  username: "Alice",
  chips: 1000,
  isReady: false,
  seatIndex: 0,
};

const ROOM_STATE: RoomState = {
  roomId: "room-1",
  gameType: "seven-card-stud",
  stakes: "$1/$2",
  maxPlayers: 6,
  hostId: "p1",
  players: [ROOM_PLAYER],
};

const GAME_PLAYER: GamePlayer = {
  userId: "p1",
  username: "Alice",
  chips: 980,
  cards: [
    { rank: "A", suit: "spades", faceUp: true },
    { rank: "K", suit: "hearts", faceUp: false },
  ],
  currentBet: 20,
  isFolded: false,
  isAllIn: false,
  seatIndex: 0,
};

const POKER_GAME_STATE: PokerGameState = {
  roomId: "room-1",
  gameType: "seven-card-stud",
  street: "3rd",
  pot: 50,
  currentBet: 20,
  minRaise: 20,
  activePlayerId: "p1",
  dealerPlayerId: "p1",
  players: [GAME_PLAYER],
  status: "playing",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  });
}

/**
 * Find and invoke the callback registered via `on.mock.calls` for a given event.
 * Simulates a socket firing an event.
 */
function fireMockOn(
  onFn: jest.Mock,
  event: string,
  ...args: unknown[]
): void {
  const calls: Array<[string, (...a: unknown[]) => void]> = onFn.mock.calls;
  for (const [ev, cb] of calls) {
    if (ev === event) {
      cb(...args);
      return;
    }
  }
  throw new Error(`No listener registered for "${event}"`);
}

// ─── Adapter unit tests (pure functions) ──────────────────────────────────────

describe("adaptRoomPlayer()", () => {
  it("maps userId → id", () => {
    expect(adaptRoomPlayer(ROOM_PLAYER).id).toBe("p1");
  });

  it("copies chips, username, seatIndex", () => {
    const p = adaptRoomPlayer(ROOM_PLAYER);
    expect(p.username).toBe("Alice");
    expect(p.chips).toBe(1000);
    expect(p.seatIndex).toBe(0);
  });

  it("preserves isReady flag", () => {
    expect(adaptRoomPlayer({ ...ROOM_PLAYER, isReady: true }).isReady).toBe(true);
    expect(adaptRoomPlayer({ ...ROOM_PLAYER, isReady: false }).isReady).toBe(false);
  });

  it("initialises cards to [] and folded to false", () => {
    const p = adaptRoomPlayer(ROOM_PLAYER);
    expect(p.cards).toEqual([]);
    expect(p.folded).toBe(false);
  });
});

describe("adaptGamePlayer()", () => {
  it("maps userId → id", () => {
    expect(adaptGamePlayer(GAME_PLAYER).id).toBe("p1");
  });

  it("maps isFolded → folded", () => {
    expect(adaptGamePlayer({ ...GAME_PLAYER, isFolded: true }).folded).toBe(true);
    expect(adaptGamePlayer({ ...GAME_PLAYER, isFolded: false }).folded).toBe(false);
  });

  it("strips faceUp from cards to match the store Card shape", () => {
    const p = adaptGamePlayer(GAME_PLAYER);
    expect(p.cards).toHaveLength(2);
    expect(p.cards[0]).not.toHaveProperty("faceUp");
    expect(p.cards[0]).toEqual({ rank: "A", suit: "spades" });
  });

  it("copies chips and currentBet", () => {
    const p = adaptGamePlayer(GAME_PLAYER);
    expect(p.chips).toBe(980);
    expect(p.currentBet).toBe(20);
  });
});

describe("adaptPokerGameState()", () => {
  const players = [adaptGamePlayer(GAME_PLAYER)];

  it("maps pot and currentBet", () => {
    const gs = adaptPokerGameState(POKER_GAME_STATE, players);
    expect(gs.pot).toBe(50);
    expect(gs.currentBet).toBe(20);
  });

  it("resolves activePlayerIndex from activePlayerId", () => {
    const gs = adaptPokerGameState(POKER_GAME_STATE, players);
    expect(gs.activePlayerIndex).toBe(0);
  });

  it("defaults activePlayerIndex to 0 when activePlayerId is null", () => {
    const gs = adaptPokerGameState({ ...POKER_GAME_STATE, activePlayerId: null }, players);
    expect(gs.activePlayerIndex).toBe(0);
  });

  it.each([
    ["playing",  "betting"],
    ["showdown", "showdown"],
    ["finished", "complete"],
  ] as const)("maps status '%s' → phase '%s'", (status, phase) => {
    expect(
      adaptPokerGameState({ ...POKER_GAME_STATE, status }, players).phase
    ).toBe(phase);
  });

  it("copies street to currentStreet", () => {
    expect(adaptPokerGameState(POKER_GAME_STATE, players).currentStreet).toBe("3rd");
  });
});

describe("adaptRoomState()", () => {
  it("maps roomId → id", () => {
    expect(adaptRoomState(ROOM_STATE).id).toBe("room-1");
  });

  it("parses '$1/$2' stakes string into { ante: 1, bringIn: 2 }", () => {
    const { ante, bringIn } = adaptRoomState(ROOM_STATE).stakes;
    expect(ante).toBe(1);
    expect(bringIn).toBe(2);
  });

  it("maps hostId → createdBy", () => {
    expect(adaptRoomState(ROOM_STATE).createdBy).toBe("p1");
  });

  it("converts players via adaptRoomPlayer", () => {
    const room = adaptRoomState(ROOM_STATE);
    expect(room.players).toHaveLength(1);
    expect(room.players[0]?.id).toBe("p1");
  });

  it("sets status to 'waiting'", () => {
    expect(adaptRoomState(ROOM_STATE).status).toBe("waiting");
  });

  it("handles malformed stakes gracefully (defaults to 0)", () => {
    const { ante, bringIn } = adaptRoomState({ ...ROOM_STATE, stakes: "invalid" }).stakes;
    expect(ante).toBe(0);
    expect(bringIn).toBe(0);
  });
});

describe("adaptPlayerPublic()", () => {
  const pp = {
    id: "p2",
    username: "Bob",
    chipCount: 800,
    status: "active" as const,
    seatIndex: 1,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    currentBet: 10,
    totalBetInRound: 10,
    hasHoleCards: true,
  };

  it("maps chipCount → chips", () => {
    expect(adaptPlayerPublic(pp).chips).toBe(800);
  });

  it("maps status 'folded' → folded = true", () => {
    expect(adaptPlayerPublic({ ...pp, status: "folded" }).folded).toBe(true);
  });

  it("maps status 'active' → isActive = true", () => {
    expect(adaptPlayerPublic({ ...pp, status: "active" }).isActive).toBe(true);
  });

  it("initialises cards to []", () => {
    expect(adaptPlayerPublic(pp).cards).toEqual([]);
  });
});

// ─── Hook integration tests ───────────────────────────────────────────────────

describe("useGameSocket() — mount / unmount", () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it("registers raw-socket listeners on mount", () => {
    renderHook(() => useGameSocket());
    const events = (mockRawSocketOn.mock.calls as [string][]).map(([e]) => e);
    expect(events).toContain("room-state");
    expect(events).toContain("player-joined");
    expect(events).toContain("player-left");
    expect(events).toContain("player-ready");
    expect(events).toContain("game-started");
    expect(events).toContain("game-state");
    expect(events).toContain("player-acted");
    expect(events).toContain("pot-updated");
    expect(events).toContain("showdown");
    expect(events).toContain("winner-declared");
    expect(events).toContain("chat-message");
    expect(events).toContain("error");
  });

  it("registers SocketService listeners on mount", () => {
    renderHook(() => useGameSocket());
    const svcEvents = (mockSvcOn.mock.calls as [string][]).map(([e]) => e);
    expect(svcEvents).toContain("game:state");
    expect(svcEvents).toContain("game:player-joined");
    expect(svcEvents).toContain("game:player-left");
    expect(svcEvents).toContain("game:deal-hole-cards");
    expect(svcEvents).toContain("game:showdown");
    expect(svcEvents).toContain("error");
  });

  it("removes raw-socket listeners on unmount", () => {
    const { unmount } = renderHook(() => useGameSocket());
    unmount();
    const events = (mockRawSocketOff.mock.calls as [string][]).map(([e]) => e);
    expect(events).toContain("room-state");
    expect(events).toContain("player-joined");
    expect(events).toContain("player-left");
  });

  it("removes SocketService listeners on unmount", () => {
    const { unmount } = renderHook(() => useGameSocket());
    unmount();
    const svcEvents = (mockSvcOff.mock.calls as [string][]).map(([e]) => e);
    expect(svcEvents).toContain("game:state");
    expect(svcEvents).toContain("game:player-joined");
  });
});

describe("useGameSocket() — legacy raw-socket events → store", () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it("'room-state' → sets room and seeds players", () => {
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "room-state", ROOM_STATE);
    });

    expect(useGameStore.getState().currentRoom?.id).toBe("room-1");
    expect(useGameStore.getState().players).toHaveLength(1);
    expect(useGameStore.getState().players[0]?.id).toBe("p1");
  });

  it("'player-joined' → adds player to store", () => {
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "player-joined", { player: ROOM_PLAYER });
    });

    expect(useGameStore.getState().players).toHaveLength(1);
    expect(useGameStore.getState().players[0]?.username).toBe("Alice");
  });

  it("'player-left' → removes player from store", () => {
    useGameStore.getState().addPlayer(adaptRoomPlayer(ROOM_PLAYER));
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "player-left", { userId: "p1" });
    });

    expect(useGameStore.getState().players).toHaveLength(0);
  });

  it("'player-ready' → updates isReady flag", () => {
    useGameStore.getState().addPlayer(adaptRoomPlayer(ROOM_PLAYER));
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "player-ready", { userId: "p1", isReady: true });
    });

    expect(useGameStore.getState().players[0]?.isReady).toBe(true);
  });

  it("'game-started' → transitions phase to 'dealing' and calls onGameStarted", () => {
    const onGameStarted = jest.fn();
    renderHook(() => useGameSocket({ onGameStarted }));

    act(() => {
      fireMockOn(mockRawSocketOn, "game-started", { roomId: "room-1" });
    });

    expect(useGameStore.getState().phase).toBe("dealing");
    expect(onGameStarted).toHaveBeenCalledWith("room-1");
  });

  it("'game-state' → updates full game state and players", () => {
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "game-state", POKER_GAME_STATE);
    });

    const s = useGameStore.getState();
    expect(s.pot).toBe(50);
    expect(s.currentBet).toBe(20);
    expect(s.phase).toBe("betting");
    expect(s.players.find((p) => p.id === "p1")).toBeTruthy();
  });

  it("'player-acted' with fold → marks player folded optimistically", () => {
    useGameStore.getState().addPlayer(adaptRoomPlayer(ROOM_PLAYER));
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "player-acted", {
        playerId: "p1",
        action: "fold",
        amount: 0,
        gameState: null,
      });
    });

    expect(useGameStore.getState().players.find((p) => p.id === "p1")?.folded).toBe(true);
  });

  it("'player-acted' with attached gameState → applies server state", () => {
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "player-acted", {
        playerId: "p1",
        action: "call",
        amount: 20,
        gameState: POKER_GAME_STATE,
      });
    });

    expect(useGameStore.getState().pot).toBe(50);
    expect(useGameStore.getState().phase).toBe("betting");
  });

  it("'pot-updated' → updates the pot scalar", () => {
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "pot-updated", { pot: 175 });
    });

    expect(useGameStore.getState().pot).toBe(175);
  });

  it("'winner-declared' → sets phase to 'complete' and calls onWinner", () => {
    const onWinner = jest.fn();
    renderHook(() => useGameSocket({ onWinner }));

    const winner = { playerId: "p1", username: "Alice", amount: 100 };
    act(() => {
      fireMockOn(mockRawSocketOn, "winner-declared", {
        winner,
        gameState: POKER_GAME_STATE,
      });
    });

    expect(useGameStore.getState().phase).toBe("complete");
    expect(onWinner).toHaveBeenCalledWith([winner]);
  });

  it("'chat-message' → appends to chatMessages", () => {
    renderHook(() => useGameSocket());

    const msg = { id: "m1", userId: "p1", username: "Alice", message: "gg", timestamp: 1 };
    act(() => {
      fireMockOn(mockRawSocketOn, "chat-message", msg);
    });

    expect(useGameStore.getState().chatMessages[0]?.message).toBe("gg");
  });

  it("'error' → calls onError callback", () => {
    const onError = jest.fn();
    renderHook(() => useGameSocket({ onError }));

    act(() => {
      fireMockOn(mockRawSocketOn, "error", "Something went wrong");
    });

    expect(onError).toHaveBeenCalledWith("Something went wrong");
  });

  it("'room-closed' → clears game and calls onRoomClosed", () => {
    const onRoomClosed = jest.fn();
    useGameStore.getState().addPlayer(adaptRoomPlayer(ROOM_PLAYER));
    renderHook(() => useGameSocket({ onRoomClosed }));

    act(() => {
      fireMockOn(mockRawSocketOn, "room-closed");
    });

    expect(onRoomClosed).toHaveBeenCalled();
    expect(useGameStore.getState().players).toHaveLength(0);
  });

  it("'host-changed' → updates room.createdBy and calls onHostChanged", () => {
    const onHostChanged = jest.fn();
    useGameStore.getState().setRoom(adaptRoomState(ROOM_STATE));
    renderHook(() => useGameSocket({ onHostChanged }));

    act(() => {
      fireMockOn(mockRawSocketOn, "host-changed", { hostId: "p2" });
    });

    expect(onHostChanged).toHaveBeenCalledWith("p2");
    expect(useGameStore.getState().currentRoom?.createdBy).toBe("p2");
  });

  it("'showdown' with game state → updates store", () => {
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockRawSocketOn, "showdown", { gameState: POKER_GAME_STATE });
    });

    expect(useGameStore.getState().pot).toBe(50);
  });
});

describe("useGameSocket() — SocketService typed events → store", () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it("'game:player-joined' → adds PlayerPublic to store", () => {
    renderHook(() => useGameSocket());

    const pp = {
      id: "p2", username: "Bob", chipCount: 800, status: "active" as const,
      seatIndex: 1, isDealer: false, isSmallBlind: false, isBigBlind: false,
      currentBet: 0, totalBetInRound: 0, hasHoleCards: false,
    };

    act(() => {
      fireMockOn(mockSvcOn, "game:player-joined", pp);
    });

    const bob = useGameStore.getState().players.find((p) => p.id === "p2");
    expect(bob?.username).toBe("Bob");
    expect(bob?.chips).toBe(800);
  });

  it("'game:player-left' → removes player from store", () => {
    useGameStore.getState().addPlayer(adaptRoomPlayer(ROOM_PLAYER));
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockSvcOn, "game:player-left", "p1");
    });

    expect(useGameStore.getState().players).toHaveLength(0);
  });

  it("'game:deal-hole-cards' → sets myCards", () => {
    renderHook(() => useGameSocket());

    const cards = [{ rank: "A" as const, suit: "spades" as const }];
    act(() => {
      fireMockOn(mockSvcOn, "game:deal-hole-cards", cards);
    });

    expect(useGameStore.getState().myCards).toEqual(cards);
  });

  it("'game:showdown' → calls onShowdown callback", () => {
    const onShowdown = jest.fn();
    renderHook(() => useGameSocket({ onShowdown }));

    const results = [
      { playerId: "p1", player: {} as never, handDescription: "Full House", handScore: 7, winAmount: 100, isWinner: true },
    ];
    act(() => {
      fireMockOn(mockSvcOn, "game:showdown", results);
    });

    expect(onShowdown).toHaveBeenCalledWith(results);
  });

  it("'error' from service → calls onError callback", () => {
    const onError = jest.fn();
    renderHook(() => useGameSocket({ onError }));

    act(() => {
      fireMockOn(mockSvcOn, "error", "Service error");
    });

    expect(onError).toHaveBeenCalledWith("Service error");
  });

  it("'game:phase-change' → updates phase in store", () => {
    useGameStore.getState().updateGameState({
      pot: 0, currentBet: 0, activePlayerIndex: 0,
      phase: "betting", currentStreet: "", deck: [],
    });
    renderHook(() => useGameSocket());

    act(() => {
      fireMockOn(mockSvcOn, "game:phase-change", "showdown");
    });

    expect(useGameStore.getState().phase).toBe("showdown");
  });
});

describe("useGameSocket() — return value", () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it("exposes isConnected: false when socket is not connected", () => {
    mockSvcIsConnected.mockReturnValue(false);
    const { result } = renderHook(() => useGameSocket());
    expect(result.current.isConnected).toBe(false);
  });

  it("exposes isConnected: true when socketService reports connected", () => {
    mockSvcIsConnected.mockReturnValue(true);
    const { result } = renderHook(() => useGameSocket());
    expect(result.current.isConnected).toBe(true);
  });
});
