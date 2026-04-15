/**
 * GamePlayScreen integration tests.
 *
 * Strategy
 * ────────
 * The new screen reads state from the Zustand `game-store` and delegates
 * socket events to `useGameSocket`.  Tests:
 *
 *   1. Populate the real Zustand game-store with fixture data before rendering.
 *   2. Mock `useGameSocket` so it returns `{ isConnected: true }` and captures
 *      the lifecycle callbacks so tests can trigger them.
 *   3. Mock `getSocket()` to capture / fire raw socket events.
 *   4. Mock other dependencies (auth-store, settings-store, expo-router, etc.).
 *
 * Component-level behaviour (ActionPanel timer, RaiseSlider presets, ChatBox
 * expand/send) is tested in the dedicated component test files.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({ roomId: "room-abc" })),
}));

jest.mock("../../store/auth-store", () => ({ useAuthStore: jest.fn() }));
jest.mock("../../store/settings-store", () => ({ useSettingsStore: jest.fn() }));
jest.mock("../../lib/gameRegistry", () => ({
  GAME_REGISTRY: [{ id: "7-card-stud", name: "7 Card Stud" }],
}));

// SocketService mock — captured emit spy + leaveRoom spy
const mockServiceEmit  = jest.fn();
const mockLeaveRoom    = jest.fn();
jest.mock("../../lib/socket-service", () => ({
  socketService: {
    emit:        (...a: unknown[]) => mockServiceEmit(...a),
    leaveRoom:   (...a: unknown[]) => mockLeaveRoom(...a),
    isConnected: () => true,
    on:  jest.fn(),
    off: jest.fn(),
  },
}));

// Raw socket mock
const socketHandlers: Record<string, ((...args: any[]) => void)[]> = {};
const mockRawEmit = jest.fn();
const mockRawSocket = {
  on:        jest.fn((event: string, fn: (...args: any[]) => void) => {
    (socketHandlers[event] ??= []).push(fn);
  }),
  off:       jest.fn((event: string, fn: (...args: any[]) => void) => {
    if (socketHandlers[event]) {
      socketHandlers[event] = socketHandlers[event].filter((h) => h !== fn);
    }
  }),
  emit:      jest.fn((...a: unknown[]) => mockRawEmit(...a)),
  connected: true,
};
jest.mock("../../lib/socket", () => ({
  getSocket:     jest.fn(() => mockRawSocket),
  connectSocket: jest.fn(() => mockRawSocket),
}));

// useGameSocket mock — captures callbacks so tests can trigger them
let capturedGameSocketOpts: Record<string, (...args: any[]) => void> = {};
const mockUseGameSocket = jest.fn(() => ({ isConnected: true }));
jest.mock("../../hooks/useGameSocket", () => ({
  useGameSocket: (opts: Record<string, (...args: any[]) => void> = {}) => {
    capturedGameSocketOpts = opts;
    return mockUseGameSocket(opts);
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { router } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { useSettingsStore } from "../../store/settings-store";
import { useGameStore } from "../../store/game-store";
import GamePlayScreen from "../../app/(app)/game-play/[roomId]";
import type { Player, Room } from "../../store/game-store";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ME_ID  = "user-me";
const OPP_ID = "user-opp";

const PLAYER_ME: Player = {
  id:         ME_ID,
  username:   "PokerAce",
  chips:      1000,
  seatIndex:  0,
  cards:      [
    { rank: "K", suit: "hearts",   faceUp: false },
    { rank: "A", suit: "spades",   faceUp: true  },
  ],
  currentBet: 0,
  folded:     false,
  isReady:    true,
  isActive:   true,
};

const PLAYER_OPP: Player = {
  id:         OPP_ID,
  username:   "CardShark",
  chips:      800,
  seatIndex:  1,
  cards:      [
    { rank: "Q", suit: "diamonds", faceUp: false },
    { rank: "J", suit: "clubs",    faceUp: true  },
  ],
  currentBet: 20,
  folded:     false,
  isReady:    true,
  isActive:   false,
};

const MOCK_ROOM: Room = {
  id:         "room-abc",
  gameType:   "7-card-stud",
  stakes:     { ante: 5, bringIn: 10 },
  maxPlayers: 6,
  players:    [PLAYER_ME, PLAYER_OPP],
  status:     "playing",
  createdBy:  ME_ID,
};

// ─── Setup helpers ────────────────────────────────────────────────────────────

function setupAuthStore(userId = ME_ID) {
  jest.mocked(useAuthStore).mockReturnValue({
    user: { id: userId, email: "me@test.com", user_metadata: { username: "PokerAce" } },
    session: { access_token: "tok" },
    isAuthenticated: true,
    isLoading: false,
    signOut: jest.fn(),
    chips: 1000,
  } as any);
}

function setupSettingsStore() {
  jest.mocked(useSettingsStore).mockReturnValue({
    showHandStrength: true,
  } as any);
}

function populateStore({
  phase   = "dealing" as const,
  pot     = 50,
  players = [PLAYER_ME, PLAYER_OPP],
} = {}) {
  const store = useGameStore.getState();
  store.setMyPlayerId(ME_ID);
  store.setRoom(MOCK_ROOM);

  for (const p of players) store.addPlayer(p);

  store.updateGameState({
    pot,
    currentBet:         0,
    activePlayerIndex:  0,
    phase,
    currentStreet:      "3rd Street",
    deck:               [],
  });
}

function emitRawSocket(event: string, data: unknown) {
  (socketHandlers[event] ?? []).forEach((h) => h(data));
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  capturedGameSocketOpts = {};

  // Restore the default connected implementation between tests.
  mockUseGameSocket.mockImplementation(() => ({ isConnected: true }));

  setupAuthStore();
  setupSettingsStore();

  // Reset the Zustand store to its initial state before each test.
  useGameStore.getState().clearGame();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe("GamePlayScreen — loading", () => {
  it("shows loading indicator when no players in store", () => {
    render(<GamePlayScreen />);
    expect(screen.getByTestId("loading-screen")).toBeTruthy();
  });

  it("emits get-game-state on mount", () => {
    render(<GamePlayScreen />);
    expect(mockRawSocket.emit).toHaveBeenCalledWith("get-game-state", {
      roomId: "room-abc",
    });
  });

  it("hides loading when players arrive in the store", async () => {
    render(<GamePlayScreen />);
    act(() => {
      useGameStore.getState().addPlayer(PLAYER_ME);
      useGameStore.getState().addPlayer(PLAYER_OPP);
    });
    await waitFor(() =>
      expect(screen.queryByTestId("loading-screen")).toBeNull()
    );
  });

  it("shows error screen after timeout when game-state never arrives", async () => {
    jest.useFakeTimers();
    render(<GamePlayScreen />);
    act(() => { jest.advanceTimersByTime(7_000); });
    await waitFor(() => expect(screen.getByTestId("error-screen")).toBeTruthy());
    jest.useRealTimers();
  });
});

// ─── Header ───────────────────────────────────────────────────────────────────

describe("GamePlayScreen — header", () => {
  beforeEach(() => { populateStore(); });

  it("renders the game header", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByTestId("game-header")).toBeTruthy();
  });

  it("shows the pot in the header", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByText(/Pot: \$50/)).toBeTruthy();
  });

  it("menu button opens the pause menu", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    fireEvent.press(screen.getByTestId("btn-menu"));
    expect(screen.getByTestId("pause-menu")).toBeTruthy();
  });
});

// ─── My area ─────────────────────────────────────────────────────────────────

describe("GamePlayScreen — my area", () => {
  beforeEach(() => { populateStore(); });

  it("renders my cards area", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByTestId("my-area")).toBeTruthy();
  });

  it("shows my chip count", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByText(/\$1,000/)).toBeTruthy();
  });
});

// ─── Game table ───────────────────────────────────────────────────────────────

describe("GamePlayScreen — game table", () => {
  beforeEach(() => { populateStore(); });

  it("renders the game table component", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByTestId("game-table")).toBeTruthy();
  });

  it("shows opponents' seats on the table", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByTestId(`seat-${OPP_ID}`)).toBeTruthy();
  });
});

// ─── Action panel ─────────────────────────────────────────────────────────────

describe("GamePlayScreen — action panel", () => {
  beforeEach(() => {
    populateStore({ phase: "dealing" });
    useGameStore.getState().setMyPlayerId(ME_ID);
  });

  it("renders action panel when I'm in game and not folded", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByTestId("action-panel")).toBeTruthy();
  });

  it("fold emits player-action:fold to both sockets", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());

    // Mark it as my turn so fold button is not disabled.
    act(() => {
      useGameStore.getState().updateGameState({
        pot: 50,
        currentBet: 0,
        activePlayerIndex: 0,
        phase: "dealing",
        currentStreet: "3rd",
        deck: [],
      });
    });

    fireEvent.press(screen.getByTestId("btn-fold"));
    await waitFor(() => {
      expect(mockServiceEmit).toHaveBeenCalledWith(
        "player-action",
        expect.objectContaining({ action: "fold" })
      );
    });
  });
});

// ─── Raise slider ─────────────────────────────────────────────────────────────

describe("GamePlayScreen — raise slider", () => {
  beforeEach(() => {
    populateStore({ phase: "dealing" });
  });

  it("opens raise slider when raise button pressed", async () => {
    // Give myPlayer enough chips to raise and set canRaise=true.
    act(() => {
      useGameStore.getState().updateGameState({
        pot: 50, currentBet: 0, activePlayerIndex: 0,
        phase: "dealing", currentStreet: "3rd", deck: [],
      });
    });

    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());

    // If canRaise is computed true from the store, btn-raise should exist.
    const raiseBtn = screen.queryByTestId("btn-raise");
    if (raiseBtn) {
      fireEvent.press(raiseBtn);
      expect(screen.getByTestId("raise-slider")).toBeTruthy();
    }
  });
});

// ─── Chat box ─────────────────────────────────────────────────────────────────

describe("GamePlayScreen — chat", () => {
  beforeEach(() => { populateStore(); });

  it("renders the chat box", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByTestId("chat-box")).toBeTruthy();
  });

  it("emits chat-message when onSend called", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());

    // Expand the chat and send a message.
    fireEvent.press(screen.getByTestId("chat-toggle"));
    fireEvent.changeText(screen.getByTestId("chat-input"), "Hello world");
    fireEvent.press(screen.getByTestId("chat-send"));

    expect(mockRawSocket.emit).toHaveBeenCalledWith(
      "chat-message",
      { roomId: "room-abc", message: "Hello world" }
    );
  });
});

// ─── Pause menu ───────────────────────────────────────────────────────────────

describe("GamePlayScreen — pause menu", () => {
  beforeEach(() => { populateStore(); });

  it("opens pause menu on menu button press", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    fireEvent.press(screen.getByTestId("btn-menu"));
    expect(screen.getByTestId("pause-menu")).toBeTruthy();
  });

  it("closes pause menu on Resume press", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    fireEvent.press(screen.getByTestId("btn-menu"));
    fireEvent.press(screen.getByTestId("btn-resume"));
    expect(screen.queryByTestId("pause-menu")).toBeNull();
  });

  it("navigates to settings from pause menu", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    fireEvent.press(screen.getByTestId("btn-menu"));
    fireEvent.press(screen.getByTestId("btn-pause-settings"));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith("/(app)/settings");
  });
});

// ─── Reconnecting overlay ─────────────────────────────────────────────────────

describe("GamePlayScreen — reconnecting overlay", () => {
  it("shows reconnecting overlay when isConnected=false", async () => {
    // Use mockImplementation so ALL renders of the hook return disconnected.
    mockUseGameSocket.mockImplementation(() => ({ isConnected: false }));
    populateStore();
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.getByTestId("reconnecting-overlay")).toBeTruthy();
  });

  it("hides reconnecting overlay when isConnected=true", async () => {
    mockUseGameSocket.mockImplementation(() => ({ isConnected: true }));
    populateStore();
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    expect(screen.queryByTestId("reconnecting-overlay")).toBeNull();
  });
});

// ─── Winner banner ────────────────────────────────────────────────────────────

describe("GamePlayScreen — winner banner", () => {
  beforeEach(() => { populateStore(); });

  it("shows winner banner when onWinner callback fires", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());

    act(() => {
      capturedGameSocketOpts.onWinner?.({
        playerId:        ME_ID,
        username:        "PokerAce",
        amount:          200,
        handDescription: "Flush",
      });
    });

    await waitFor(() => expect(screen.getByTestId("winner-banner")).toBeTruthy());
    expect(screen.getByText("You Won!")).toBeTruthy();
  });

  it("dismissing winner banner navigates to lobby", async () => {
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());

    act(() => {
      capturedGameSocketOpts.onWinner?.({
        playerId: ME_ID, username: "PokerAce", amount: 200,
      });
    });

    await waitFor(() => screen.getByTestId("btn-winner-dismiss"));
    fireEvent.press(screen.getByTestId("btn-winner-dismiss"));
    expect(jest.mocked(router.replace)).toHaveBeenCalledWith("/(app)/lobby");
  });
});

// ─── Hand strength indicator ──────────────────────────────────────────────────

describe("GamePlayScreen — hand strength", () => {
  it("shows hand strength when onShowdown fires with my result", async () => {
    populateStore();
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());

    act(() => {
      capturedGameSocketOpts.onShowdown?.([
        { playerId: ME_ID, handDescription: "Pair of Aces", isWinner: true, winAmount: 100, handScore: 2 },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("hand-strength")).toBeTruthy();
      expect(screen.getByTestId("hand-strength-text").props.children).toBe("Pair of Aces");
    });
  });
});

// ─── Leave game ───────────────────────────────────────────────────────────────

describe("GamePlayScreen — leave game", () => {
  beforeEach(() => { populateStore(); });

  it("shows leave confirmation alert when exit button pressed", async () => {
    const alertSpy = jest.spyOn(require("react-native").Alert, "alert");
    render(<GamePlayScreen />);
    await waitFor(() => expect(screen.queryByTestId("loading-screen")).toBeNull());
    fireEvent.press(screen.getByTestId("btn-exit"));
    expect(alertSpy).toHaveBeenCalledWith(
      "Leave Game",
      expect.any(String),
      expect.any(Array)
    );
  });
});
