/**
 * LobbyScreen tests.
 *
 * Strategy
 * ────────
 * • fetchGames and socket are fully mocked so tests run offline.
 * • The socket mock captures on/off handlers so tests can fire "room-list-updated"
 *   and "room-joined" events manually.
 * • Auto-refresh uses jest.useFakeTimers() to skip wallclock time.
 * • The LobbyScreen renders a loading spinner first; most tests must waitFor
 *   the game list to appear before making their main assertion.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("../../store/auth-store", () => ({ useAuthStore: jest.fn() }));
jest.mock("../../lib/gamesApi", () => ({ fetchGames: jest.fn() }));

// Socket mock — captures event handlers so tests can fire events.
const mockSocketHandlers: Record<string, ((...args: any[]) => void)[]> = {};
const mockSocket = {
  on: jest.fn((event: string, handler: (...args: any[]) => void) => {
    (mockSocketHandlers[event] ??= []).push(handler);
  }),
  off: jest.fn((event: string, handler: (...args: any[]) => void) => {
    if (mockSocketHandlers[event]) {
      mockSocketHandlers[event] = mockSocketHandlers[event].filter(
        (h) => h !== handler
      );
    }
  }),
  emit: jest.fn(),
  connected: true,
  connect: jest.fn(),
  auth: {} as Record<string, string>,
};

jest.mock("../../lib/socket", () => ({
  getSocket: jest.fn(() => mockSocket),
  connectSocket: jest.fn(() => mockSocket),
  disconnectSocket: jest.fn(),
}));

import { router } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { fetchGames } from "../../lib/gamesApi";
import LobbyScreen from "../../app/(app)/lobby";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSignOut = jest.fn();
const mockFetchGames = jest.mocked(fetchGames);

const MOCK_USER = {
  id: "u1",
  email: "test@test.com",
  user_metadata: { username: "PokerKing" },
} as any;

const MOCK_SESSION = { access_token: "tok-123" } as any;

const GAME_A: import("../../types/game").GameRoom = {
  id: "g1",
  name: "Friday Night Stud",
  gameType: "7 Card Stud",
  stakes: "$1/$2",
  players: 3,
  maxPlayers: 8,
  status: "waiting",
};

const GAME_B: import("../../types/game").GameRoom = {
  id: "g2",
  name: "High Rollers",
  gameType: "5 Card Stud",
  stakes: "$5/$10",
  players: 8,
  maxPlayers: 8,
  status: "playing",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupStore(overrides: Partial<{ chips: number }> = {}) {
  jest.mocked(useAuthStore).mockReturnValue({
    user: MOCK_USER,
    chips: overrides.chips ?? 1_000,
    session: MOCK_SESSION,
    signOut: mockSignOut,
    isAuthenticated: true,
    isLoading: false,
  } as any);
}

/** Fire all handlers registered for a socket event. */
function emitSocket(event: string, data: unknown) {
  (mockSocketHandlers[event] ?? []).forEach((h) => h(data));
}

/** Render and wait for the initial loading spinner to resolve. */
async function renderAndWait() {
  render(<LobbyScreen />);
  // Wait until the loading-screen disappears (games fetched).
  await waitFor(() =>
    expect(screen.queryByTestId("loading-screen")).toBeNull()
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Clear captured socket handlers.
  Object.keys(mockSocketHandlers).forEach((k) => delete mockSocketHandlers[k]);

  setupStore();
  mockFetchGames.mockResolvedValue([GAME_A]);
});

afterEach(() => {
  jest.useRealTimers();
  // Restore any spies so they don't leak into subsequent tests.
  jest.restoreAllMocks();
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe("LobbyScreen — loading", () => {
  it("shows loading indicator while games are being fetched", async () => {
    // Never resolve so we stay in loading state.
    mockFetchGames.mockReturnValue(new Promise(() => {}));
    render(<LobbyScreen />);
    expect(screen.getByTestId("loading-screen")).toBeTruthy();
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
  });

  it("hides loading indicator after games are fetched", async () => {
    await renderAndWait();
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });
});

// ─── Header ───────────────────────────────────────────────────────────────────

describe("LobbyScreen — header", () => {
  it("shows the user's username", async () => {
    await renderAndWait();
    expect(screen.getByText("Welcome, PokerKing")).toBeTruthy();
  });

  it("shows the chip count formatted with commas", async () => {
    setupStore({ chips: 12_500 });
    await renderAndWait();
    expect(screen.getByTestId("chips-text").props.children).toContain("12,500");
  });

  it("navigates to profile screen when profile button is pressed", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-profile"));
    expect(router.push).toHaveBeenCalledWith("/(app)/profile");
  });

  it("navigates to settings screen when settings button is pressed", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-settings"));
    expect(router.push).toHaveBeenCalledWith("/(app)/settings");
  });

  it("calls signOut when logout button is pressed", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-logout"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

// ─── Game cards ───────────────────────────────────────────────────────────────

describe("LobbyScreen — game cards", () => {
  it("renders a card for each game", async () => {
    mockFetchGames.mockResolvedValue([GAME_A, GAME_B]);
    await renderAndWait();
    expect(screen.getByTestId("game-card-g1")).toBeTruthy();
    expect(screen.getByTestId("game-card-g2")).toBeTruthy();
  });

  it("displays the game type on each card", async () => {
    await renderAndWait();
    expect(screen.getByTestId("game-type-g1").props.children).toBe("7 Card Stud");
  });

  it("displays the game name", async () => {
    await renderAndWait();
    expect(screen.getByText("Friday Night Stud")).toBeTruthy();
  });

  it("displays stakes", async () => {
    await renderAndWait();
    expect(screen.getByTestId("game-stakes-g1").props.children).toContain("$1/$2");
  });

  it("displays player count", async () => {
    await renderAndWait();
    // children is an array of mixed React nodes; players count is a number.
    expect(screen.getByTestId("game-players-g1").props.children).toContain(3);
  });

  it("shows Join Game button when game is not full", async () => {
    await renderAndWait();
    expect(screen.getByText("Join Game")).toBeTruthy();
  });

  it("disables the join button when game is full", async () => {
    mockFetchGames.mockResolvedValue([GAME_B]);
    await renderAndWait();
    expect(
      screen.getByTestId("btn-join-g2").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("shows 'Full' text on disabled join button", async () => {
    mockFetchGames.mockResolvedValue([GAME_B]);
    await renderAndWait();
    expect(screen.getByText("Full")).toBeTruthy();
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe("LobbyScreen — empty state", () => {
  it("shows empty state when no games are returned", async () => {
    mockFetchGames.mockResolvedValue([]);
    await renderAndWait();
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.getByText("No active games")).toBeTruthy();
  });

  it("hides empty state when games exist", async () => {
    await renderAndWait();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe("LobbyScreen — error state", () => {
  it("shows an error banner when fetchGames throws", async () => {
    mockFetchGames.mockRejectedValue(new Error("Network error"));
    await renderAndWait();
    expect(screen.getByTestId("error-message")).toBeTruthy();
    expect(screen.getByText("Could not load games. Pull down to retry.")).toBeTruthy();
  });

  it("clears the error banner after a successful retry", async () => {
    mockFetchGames
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue([GAME_A]);
    await renderAndWait(); // first load fails → error shown

    await act(async () => {
      // Trigger pull-to-refresh manually via the FlatList's refreshControl.
      const gameList = screen.getByTestId("game-list");
      gameList.props.refreshControl?.props.onRefresh?.();
    });

    await waitFor(() =>
      expect(screen.queryByTestId("error-message")).toBeNull()
    );
  });
});

// ─── Create game ──────────────────────────────────────────────────────────────

describe("LobbyScreen — create game", () => {
  it("renders the Create Game button", async () => {
    await renderAndWait();
    expect(screen.getByTestId("btn-create")).toBeTruthy();
  });

  it("navigates to create-game on press", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-create"));
    expect(router.push).toHaveBeenCalledWith("/(app)/create-game");
  });
});

// ─── Joining a game ───────────────────────────────────────────────────────────

describe("LobbyScreen — joining", () => {
  it("emits join-room with the correct roomId", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-join-g1"));
    expect(mockSocket.emit).toHaveBeenCalledWith("join-room", { roomId: "g1" });
  });

  it("shows a spinner on the joining card's button", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-join-g1"));
    await waitFor(() =>
      expect(screen.getByTestId("join-spinner-g1")).toBeTruthy()
    );
  });

  it("disables the joining button while joining", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-join-g1"));
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-join-g1").props.accessibilityState?.disabled
      ).toBe(true)
    );
  });

  it("navigates to the game room on room-joined event", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-join-g1"));

    await act(async () => {
      emitSocket("room-joined", { roomId: "g1" });
    });

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/(app)/game/g1")
    );
  });

  it("clears joiningId after room-joined fires", async () => {
    await renderAndWait();
    fireEvent.press(screen.getByTestId("btn-join-g1"));

    await act(async () => {
      emitSocket("room-joined", { roomId: "g1" });
    });

    await waitFor(() =>
      expect(screen.queryByTestId("join-spinner-g1")).toBeNull()
    );
  });
});

// ─── Socket — room-list-updated ───────────────────────────────────────────────

describe("LobbyScreen — socket room-list-updated", () => {
  it("updates the game list when socket pushes new rooms", async () => {
    await renderAndWait();
    expect(screen.queryByText("High Rollers")).toBeNull();

    await act(async () => {
      emitSocket("room-list-updated", [GAME_A, GAME_B]);
    });

    await waitFor(() =>
      expect(screen.getByText("High Rollers")).toBeTruthy()
    );
  });

  it("replaces the entire list on room-list-updated", async () => {
    await renderAndWait();
    expect(screen.getByText("Friday Night Stud")).toBeTruthy();

    await act(async () => {
      emitSocket("room-list-updated", [GAME_B]);
    });

    await waitFor(() =>
      expect(screen.queryByText("Friday Night Stud")).toBeNull()
    );
  });
});

// ─── Auto-refresh ─────────────────────────────────────────────────────────────
//
// We avoid jest.useFakeTimers() here because React 18's act() flushes all fake
// timers during render, causing infinite loops with setInterval.
// Instead we spy on setInterval/clearInterval directly.

describe("LobbyScreen — auto-refresh every 5 s", () => {
  it("registers a polling interval with a 5-second delay", async () => {
    const spy = jest.spyOn(global, "setInterval");
    await renderAndWait();
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 5_000);
    spy.mockRestore();
  });

  it("calls fetchGames when the interval fires", async () => {
    // Capture the 5-second polling callback.
    // Pass all other setInterval calls (including waitFor's internal polling)
    // through to the real implementation so they continue to work.
    let pollingCb: (() => void) | null = null;
    const origSetInterval = global.setInterval.bind(global);
    jest
      .spyOn(global, "setInterval")
      .mockImplementation((fn: TimerHandler, ms?: number) => {
        if (ms === 5_000) {
          pollingCb = fn as () => void;
          return 0 as unknown as ReturnType<typeof setInterval>;
        }
        return origSetInterval(fn, ms!);
      });

    await renderAndWait();

    const callsBefore = mockFetchGames.mock.calls.length;
    await act(async () => { pollingCb?.(); });
    expect(mockFetchGames.mock.calls.length).toBeGreaterThan(callsBefore);
    // spy.mockRestore() is handled by the afterEach jest.restoreAllMocks().
  });

  it("clears the polling interval when the component unmounts", async () => {
    const spyClear = jest.spyOn(global, "clearInterval");
    const { unmount } = render(<LobbyScreen />);
    await waitFor(() =>
      expect(screen.queryByTestId("loading-screen")).toBeNull()
    );
    unmount();
    expect(spyClear).toHaveBeenCalled();
    // spy.mockRestore() is handled by the afterEach jest.restoreAllMocks().
  });
});

// ─── Pull-to-refresh ─────────────────────────────────────────────────────────

describe("LobbyScreen — pull-to-refresh", () => {
  it("calls fetchGames when pull-to-refresh is triggered", async () => {
    await renderAndWait();
    const before = mockFetchGames.mock.calls.length;

    await act(async () => {
      const gameList = screen.getByTestId("game-list");
      gameList.props.refreshControl?.props.onRefresh?.();
    });

    await waitFor(() =>
      expect(mockFetchGames.mock.calls.length).toBeGreaterThan(before)
    );
  });
});
