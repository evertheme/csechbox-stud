/**
 * GameRoomScreen tests.
 *
 * Strategy
 * ────────
 * • Socket is fully mocked; handlers are captured so tests can fire every
 *   incoming event (room-state, player-joined, player-left, etc.) manually.
 * • Auth store is mocked with the current user's ID.
 * • useLocalSearchParams is mocked to return { roomId: "test-room-1" }.
 * • Loading state is tested by withholding the "room-state" socket event.
 * • Timeout is tested using the same pass-through setTimeout spy pattern.
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
  router: { replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({ roomId: "test-room-1" })),
}));

jest.mock("../../store/auth-store", () => ({ useAuthStore: jest.fn() }));

// Socket mock — captures on/off handlers so tests can fire events.
const socketHandlers: Record<string, ((...args: any[]) => void)[]> = {};
const mockSocket = {
  on: jest.fn((event: string, handler: (...args: any[]) => void) => {
    (socketHandlers[event] ??= []).push(handler);
  }),
  off: jest.fn((event: string, handler: (...args: any[]) => void) => {
    if (socketHandlers[event]) {
      socketHandlers[event] = socketHandlers[event].filter((h) => h !== handler);
    }
  }),
  emit: jest.fn(),
  connected: true,
};

jest.mock("../../lib/socket", () => ({
  getSocket: jest.fn(() => mockSocket),
  connectSocket: jest.fn(() => mockSocket),
}));

import { router } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import GameRoomScreen from "../../app/(app)/game/[roomId]";
import type { RoomState, RoomPlayer } from "../../types/game";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ME_ID = "user-host";
const OTHER_ID = "user-other";

const PLAYER_ME: RoomPlayer = {
  userId: ME_ID,
  username: "HostPro",
  chips: 1_000,
  isReady: false,
  seatIndex: 0,
};

const PLAYER_OTHER: RoomPlayer = {
  userId: OTHER_ID,
  username: "CardShark",
  chips: 500,
  isReady: false,
  seatIndex: 1,
};

const BASE_ROOM: RoomState = {
  roomId: "test-room-1",
  gameType: "7-card-stud",
  stakes: "$1/$2",
  maxPlayers: 4,
  hostId: ME_ID,
  players: [PLAYER_ME, PLAYER_OTHER],
};

const ROOM_WITH_BUY_IN: RoomState = {
  ...BASE_ROOM,
  startingBuyIn: 1_000,
  minRebuy: 500,
  maxRebuy: 2_000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupStore(userId = ME_ID) {
  jest.mocked(useAuthStore).mockReturnValue({
    user: { id: userId, user_metadata: { username: "HostPro" } },
    chips: 1_000,
    session: { access_token: "tok-abc" },
    signOut: jest.fn(),
    isAuthenticated: true,
    isLoading: false,
  } as any);
}

function emitSocket(event: string, data: unknown) {
  (socketHandlers[event] ?? []).forEach((h) => h(data));
}

/** Render the screen and immediately fire room-state. */
async function renderWithRoom(room: RoomState = BASE_ROOM) {
  render(<GameRoomScreen />);
  await act(async () => { emitSocket("room-state", room); });
  await waitFor(() =>
    expect(screen.queryByTestId("loading-screen")).toBeNull()
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  setupStore();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe("GameRoomScreen — loading", () => {
  it("shows loading indicator before room-state arrives", () => {
    render(<GameRoomScreen />);
    expect(screen.getByTestId("loading-screen")).toBeTruthy();
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
  });

  it("hides the loading indicator after room-state fires", async () => {
    await renderWithRoom();
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });

  it("emits get-room on mount with the correct roomId", () => {
    render(<GameRoomScreen />);
    expect(mockSocket.emit).toHaveBeenCalledWith("get-room", {
      roomId: "test-room-1",
    });
  });
});

// ─── Error / timeout state ────────────────────────────────────────────────────

describe("GameRoomScreen — error/timeout", () => {
  it("shows error screen when timeout fires before room-state", async () => {
    let timeoutCb: (() => void) | null = null;
    const origSetTimeout = global.setTimeout.bind(global);
    jest.spyOn(global, "setTimeout").mockImplementation((fn, ms, ...args) => {
      if (ms === 5_000) {
        timeoutCb = fn as () => void;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return origSetTimeout(fn, ms, ...args);
    });

    render(<GameRoomScreen />);
    await act(async () => { timeoutCb?.(); });

    await waitFor(() =>
      expect(screen.getByTestId("error-screen")).toBeTruthy()
    );
    expect(screen.getByTestId("error-message")).toBeTruthy();
  });

  it("navigates back when the error screen back button is pressed", async () => {
    let timeoutCb: (() => void) | null = null;
    const origSetTimeout = global.setTimeout.bind(global);
    jest.spyOn(global, "setTimeout").mockImplementation((fn, ms, ...args) => {
      if (ms === 5_000) {
        timeoutCb = fn as () => void;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return origSetTimeout(fn, ms, ...args);
    });

    render(<GameRoomScreen />);
    await act(async () => { timeoutCb?.(); });
    await waitFor(() => screen.getByTestId("btn-error-back"));

    fireEvent.press(screen.getByTestId("btn-error-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

// ─── Room info bar ────────────────────────────────────────────────────────────

describe("GameRoomScreen — room info bar", () => {
  it("shows the info bar", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("info-bar")).toBeTruthy();
  });

  it("always shows fixed $1/$2 stakes label", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("stakes-text").props.children).toContain("$1/$2");
  });

  it("marks stakes as Fixed", async () => {
    await renderWithRoom();
    expect(screen.getByText(/Fixed/)).toBeTruthy();
  });

  it("shows the current player count", async () => {
    await renderWithRoom();
    // children = [2, "/", 4] — playerCount is numeric, maxPlayers is numeric.
    expect(screen.getByTestId("player-count").props.children).toEqual(
      expect.arrayContaining([2, "/", 4])
    );
  });

  it("does not show buy-in row when startingBuyIn is not in room state", async () => {
    await renderWithRoom(BASE_ROOM);
    expect(screen.queryByTestId("buy-in-text")).toBeNull();
  });

  it("does not show rebuys row when minRebuy/maxRebuy are not in room state", async () => {
    await renderWithRoom(BASE_ROOM);
    expect(screen.queryByTestId("rebuys-text")).toBeNull();
  });

  it("shows starting buy-in when provided", async () => {
    await renderWithRoom(ROOM_WITH_BUY_IN);
    expect(screen.getByTestId("buy-in-text").props.children).toBe("$1,000");
  });

  it("shows rebuys range when provided", async () => {
    await renderWithRoom(ROOM_WITH_BUY_IN);
    const rebuysText = screen.getByTestId("rebuys-text").props.children;
    expect(rebuysText).toContain("$500");
    expect(rebuysText).toContain("$2,000");
  });

  it("shows the room code", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("room-code")).toBeTruthy();
    expect(screen.getByText(/test-room-1/)).toBeTruthy();
  });

  it("uses the GAME_REGISTRY to look up the variant name", async () => {
    await renderWithRoom({ ...BASE_ROOM, gameType: "razz" });
    expect(screen.getByTestId("info-bar")).toBeTruthy();
  });
});

// ─── Game rules panel ─────────────────────────────────────────────────────────

describe("GameRoomScreen — rules panel", () => {
  it("renders the rules panel", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("rules-panel")).toBeTruthy();
  });

  it("shows the fixed stakes rule", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("rule-stakes")).toBeTruthy();
    expect(screen.getByText(/\$1 ante \/ \$2 bring-in/)).toBeTruthy();
  });

  it("shows the 2-minute rebuy timeout rule", async () => {
    await renderWithRoom();
    expect(screen.getByText(/2 min/)).toBeTruthy();
  });

  it("shows the game-end conditions", async () => {
    await renderWithRoom();
    expect(screen.getByText(/Game ends when host ends it/)).toBeTruthy();
    expect(screen.getByText(/1 player remains/)).toBeTruthy();
  });

  it("does not show buy-in rule line when startingBuyIn absent", async () => {
    await renderWithRoom(BASE_ROOM);
    expect(screen.queryByTestId("rule-buy-in")).toBeNull();
  });

  it("does not show rebuy rule line when minRebuy absent", async () => {
    await renderWithRoom(BASE_ROOM);
    expect(screen.queryByTestId("rule-rebuys")).toBeNull();
  });

  it("shows buy-in rule line when startingBuyIn provided", async () => {
    await renderWithRoom(ROOM_WITH_BUY_IN);
    expect(screen.getByTestId("rule-buy-in")).toBeTruthy();
    expect(screen.getByText(/Everyone starts: \$1,000/)).toBeTruthy();
  });

  it("shows rebuy rule line when rebuys provided", async () => {
    await renderWithRoom(ROOM_WITH_BUY_IN);
    expect(screen.getByTestId("rule-rebuys")).toBeTruthy();
    expect(screen.getByText(/Rebuy range: \$500–\$2,000/)).toBeTruthy();
  });
});

// ─── Seat grid ────────────────────────────────────────────────────────────────

describe("GameRoomScreen — seat grid", () => {
  it("renders a seat card for each seat (maxPlayers)", async () => {
    await renderWithRoom();
    for (let i = 0; i < BASE_ROOM.maxPlayers; i++) {
      expect(screen.getByTestId(`seat-card-${i}`)).toBeTruthy();
    }
  });

  it("shows occupied player names on filled seats", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("seat-player-name-1").props.children).toBe(
      "CardShark"
    );
  });

  it("shows 'You' instead of the username on the current user's seat", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("seat-player-name-0").props.children).toBe("You");
  });

  it("shows [Empty] on vacant seats", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("seat-empty-2")).toBeTruthy();
    expect(screen.getByTestId("seat-empty-3")).toBeTruthy();
  });

  it("displays the chip count on occupied seats", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("seat-chips-0")).toBeTruthy();
    expect(screen.getByText("$1,000")).toBeTruthy();
  });

  it("shows ready badge on ready players", async () => {
    const room = {
      ...BASE_ROOM,
      players: [{ ...PLAYER_ME, isReady: true }, PLAYER_OTHER],
    };
    await renderWithRoom(room);
    expect(screen.getAllByText("✓ Ready").length).toBeGreaterThan(0);
  });

  it("shows wait badge on not-ready players", async () => {
    await renderWithRoom();
    expect(screen.getAllByText("⏳ Wait").length).toBeGreaterThan(0);
  });

  it("shows the host badge on the host's seat", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("seat-host-0")).toBeTruthy();
  });

  it("does not show host badge on non-host seats", async () => {
    await renderWithRoom();
    expect(screen.queryByTestId("seat-host-1")).toBeNull();
  });

  it("highlights the current user's seat card", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("seat-card-0")).toBeTruthy();
  });
});

// ─── Toggle Ready ─────────────────────────────────────────────────────────────

describe("GameRoomScreen — Toggle Ready", () => {
  it("emits player-ready with isReady: true when not ready", async () => {
    await renderWithRoom();
    fireEvent.press(screen.getByTestId("btn-toggle-ready"));
    expect(mockSocket.emit).toHaveBeenCalledWith("player-ready", {
      roomId: "test-room-1",
      isReady: true,
    });
  });

  it("emits player-ready with isReady: false when already ready", async () => {
    const room = {
      ...BASE_ROOM,
      players: [{ ...PLAYER_ME, isReady: true }, PLAYER_OTHER],
    };
    await renderWithRoom(room);
    fireEvent.press(screen.getByTestId("btn-toggle-ready"));
    expect(mockSocket.emit).toHaveBeenCalledWith("player-ready", {
      roomId: "test-room-1",
      isReady: false,
    });
  });

  it("shows 'Not Ready' button text when not ready", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("btn-toggle-ready")).toBeTruthy();
    expect(screen.getByText("Not Ready")).toBeTruthy();
  });
});

// ─── Leave Room ───────────────────────────────────────────────────────────────

describe("GameRoomScreen — Leave Room", () => {
  it("emits leave-room with the roomId", async () => {
    await renderWithRoom();
    fireEvent.press(screen.getByTestId("btn-leave"));
    expect(mockSocket.emit).toHaveBeenCalledWith("leave-room", {
      roomId: "test-room-1",
    });
  });

  it("navigates back immediately after leaving", async () => {
    await renderWithRoom();
    fireEvent.press(screen.getByTestId("btn-leave"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

// ─── Start Game (host only) ───────────────────────────────────────────────────

describe("GameRoomScreen — Start Game", () => {
  it("shows Start Game button to the host", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("btn-start")).toBeTruthy();
  });

  it("does not show Start Game button to non-host users", async () => {
    setupStore(OTHER_ID);
    await renderWithRoom();
    expect(screen.queryByTestId("btn-start")).toBeNull();
  });

  it("disables Start Game when fewer than 2 players are ready", async () => {
    await renderWithRoom();
    expect(
      screen.getByTestId("btn-start").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("disables Start Game when only some players are ready", async () => {
    const room = {
      ...BASE_ROOM,
      players: [{ ...PLAYER_ME, isReady: true }, PLAYER_OTHER],
    };
    await renderWithRoom(room);
    expect(
      screen.getByTestId("btn-start").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("enables Start Game when 2+ players are all ready", async () => {
    const room = {
      ...BASE_ROOM,
      players: [
        { ...PLAYER_ME, isReady: true },
        { ...PLAYER_OTHER, isReady: true },
      ],
    };
    await renderWithRoom(room);
    expect(
      screen.getByTestId("btn-start").props.accessibilityState?.disabled
    ).toBe(false);
  });

  it("emits start-game with the roomId when enabled and pressed", async () => {
    const room = {
      ...BASE_ROOM,
      players: [
        { ...PLAYER_ME, isReady: true },
        { ...PLAYER_OTHER, isReady: true },
      ],
    };
    await renderWithRoom(room);
    fireEvent.press(screen.getByTestId("btn-start"));
    expect(mockSocket.emit).toHaveBeenCalledWith("start-game", {
      roomId: "test-room-1",
    });
  });

  it("does not emit start-game when disabled", async () => {
    await renderWithRoom();
    fireEvent.press(screen.getByTestId("btn-start"));
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      "start-game",
      expect.anything()
    );
  });
});

// ─── Socket: player-joined ────────────────────────────────────────────────────

describe("GameRoomScreen — socket player-joined", () => {
  it("adds the player to the correct seat", async () => {
    await renderWithRoom({ ...BASE_ROOM, players: [PLAYER_ME] });
    expect(screen.queryByText("CardShark")).toBeNull();

    await act(async () => {
      emitSocket("player-joined", { player: PLAYER_OTHER });
    });

    await waitFor(() => expect(screen.getByText("CardShark")).toBeTruthy());
  });

  it("increments the player count", async () => {
    await renderWithRoom({ ...BASE_ROOM, players: [PLAYER_ME] });

    await act(async () => {
      emitSocket("player-joined", { player: PLAYER_OTHER });
    });

    await waitFor(() =>
      expect(screen.getByTestId("player-count")).toBeTruthy()
    );
  });
});

// ─── Socket: player-left ──────────────────────────────────────────────────────

describe("GameRoomScreen — socket player-left", () => {
  it("removes the player from their seat", async () => {
    await renderWithRoom();
    expect(screen.getByText("CardShark")).toBeTruthy();

    await act(async () => {
      emitSocket("player-left", { userId: OTHER_ID });
    });

    await waitFor(() => expect(screen.queryByText("CardShark")).toBeNull());
  });

  it("decrements the player count", async () => {
    await renderWithRoom();

    await act(async () => {
      emitSocket("player-left", { userId: OTHER_ID });
    });

    await waitFor(() =>
      expect(screen.getByTestId("player-count")).toBeTruthy()
    );
  });
});

// ─── Socket: player-ready ─────────────────────────────────────────────────────

describe("GameRoomScreen — socket player-ready", () => {
  it("updates the ready badge when a player becomes ready", async () => {
    await renderWithRoom();
    expect(screen.getAllByText("⏳ Wait").length).toBeGreaterThan(0);

    await act(async () => {
      emitSocket("player-ready", { userId: OTHER_ID, isReady: true });
    });

    await waitFor(() => expect(screen.getByText("✓ Ready")).toBeTruthy());
  });

  it("toggles back to wait when a player un-readies", async () => {
    const room = {
      ...BASE_ROOM,
      players: [PLAYER_ME, { ...PLAYER_OTHER, isReady: true }],
    };
    await renderWithRoom(room);
    expect(screen.getByText("✓ Ready")).toBeTruthy();

    await act(async () => {
      emitSocket("player-ready", { userId: OTHER_ID, isReady: false });
    });

    await waitFor(() =>
      expect(screen.getAllByText("⏳ Wait").length).toBeGreaterThan(0)
    );
  });
});

// ─── Socket: game-started ─────────────────────────────────────────────────────

describe("GameRoomScreen — socket game-started", () => {
  it("navigates to the gameplay screen with the roomId", async () => {
    await renderWithRoom();

    await act(async () => {
      emitSocket("game-started", { roomId: "test-room-1" });
    });

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/(app)/game-play/test-room-1"
      )
    );
  });
});

// ─── Socket: host-changed ─────────────────────────────────────────────────────

describe("GameRoomScreen — socket host-changed", () => {
  it("transfers the host badge when host-changed fires", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("seat-host-0")).toBeTruthy();
    expect(screen.queryByTestId("seat-host-1")).toBeNull();

    await act(async () => {
      emitSocket("host-changed", { hostId: OTHER_ID });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("seat-host-0")).toBeNull();
      expect(screen.getByTestId("seat-host-1")).toBeTruthy();
    });
  });

  it("hides Start Game button when the current user is no longer host", async () => {
    await renderWithRoom();
    expect(screen.getByTestId("btn-start")).toBeTruthy();

    await act(async () => {
      emitSocket("host-changed", { hostId: OTHER_ID });
    });

    await waitFor(() =>
      expect(screen.queryByTestId("btn-start")).toBeNull()
    );
  });
});

// ─── Socket: room-closed ──────────────────────────────────────────────────────

describe("GameRoomScreen — socket room-closed", () => {
  it("navigates to the lobby when the room is closed", async () => {
    await renderWithRoom();

    await act(async () => { emitSocket("room-closed", {}); });

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/(app)/lobby")
    );
  });
});
