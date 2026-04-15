/**
 * CreateGameScreen tests.
 *
 * Strategy
 * ────────
 * • The socket is fully mocked; event handlers are captured so tests can fire
 *   "room-created" and "create-room-error" events manually.
 * • The GAME_REGISTRY is imported directly (pure data).
 * • Timeout behaviour is tested by spying on global.setTimeout.
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
}));

// Socket mock — captures event handlers so tests can fire events.
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
import CreateGameScreen from "../../app/(app)/create-game";
import { GAME_REGISTRY } from "../../lib/gameRegistry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fire all handlers registered for a socket event. */
function emitSocket(event: string, data: unknown) {
  (socketHandlers[event] ?? []).forEach((h) => h(data));
}

const FIVE_CARD_IDS = GAME_REGISTRY
  .filter((v) => v.id.startsWith("5-card"))
  .map((v) => v.id);

const SEVEN_CARD_IDS = GAME_REGISTRY
  .filter((v) => !v.id.startsWith("5-card"))
  .map((v) => v.id);

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  jest.useRealTimers();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("CreateGameScreen — rendering", () => {
  it("renders all 6 game variants", () => {
    render(<CreateGameScreen />);
    for (const variant of GAME_REGISTRY) {
      expect(screen.getByTestId(`variant-${variant.id}`)).toBeTruthy();
    }
  });

  it("renders variant names", () => {
    render(<CreateGameScreen />);
    // "5 Card Stud" appears in both the variant list and the summary card.
    expect(screen.getAllByText("5 Card Stud").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("7 Card Stud").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Razz").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the four buy-in preset buttons", () => {
    render(<CreateGameScreen />);
    for (const amount of [500, 1000, 2500, 5000]) {
      expect(screen.getByTestId(`buy-in-preset-${amount}`)).toBeTruthy();
    }
  });

  it("renders the Custom buy-in option", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("buy-in-custom")).toBeTruthy();
  });

  it("renders the fixed stakes card", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("stakes-card")).toBeTruthy();
    expect(screen.getByTestId("stakes-display")).toBeTruthy();
    expect(screen.getByText("$1 / $2")).toBeTruthy();
  });

  it("renders the rebuy settings card", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("rebuy-card")).toBeTruthy();
    expect(screen.getByTestId("rebuy-timeout")).toBeTruthy();
  });

  it("renders the game summary card", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("summary-card")).toBeTruthy();
    expect(screen.getByTestId("summary-variant")).toBeTruthy();
    expect(screen.getByTestId("summary-stakes")).toBeTruthy();
  });

  it("renders Create Game and Cancel buttons", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("btn-create")).toBeTruthy();
    expect(screen.getByTestId("btn-cancel")).toBeTruthy();
  });
});

// ─── Default values ───────────────────────────────────────────────────────────

describe("CreateGameScreen — defaults", () => {
  it("selects the first game variant (5 Card Stud) by default", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId(`variant-${GAME_REGISTRY[0]!.id}`)).toBeTruthy();
  });

  it("defaults buy-in to $1,000", () => {
    render(<CreateGameScreen />);
    // $1,000 preset should be active (contains "recommended").
    expect(screen.getByText(/\$1,000.*recommended/)).toBeTruthy();
  });

  it("defaults max players to 5 for the default 5-card game", () => {
    render(<CreateGameScreen />);
    // 5-card-stud caps at 5; initial maxPlayers(6) is clamped on first effect run.
    expect(screen.getByTestId("max-players-value").props.children).toBe(5);
  });

  it("does not show the custom buy-in text input by default", () => {
    render(<CreateGameScreen />);
    expect(screen.queryByTestId("input-custom-buy-in")).toBeNull();
  });

  it("does not show a variant description by default", () => {
    render(<CreateGameScreen />);
    expect(screen.queryByTestId(`desc-${GAME_REGISTRY[0]!.id}`)).toBeNull();
  });
});

// ─── Game variant selection ───────────────────────────────────────────────────

describe("CreateGameScreen — game variant selection", () => {
  it("selects a variant when its row is pressed", () => {
    render(<CreateGameScreen />);
    const razz = GAME_REGISTRY.find((v) => v.id === "razz")!;
    fireEvent.press(screen.getByTestId(`variant-${razz.id}`));
    expect(screen.getByTestId(`variant-${razz.id}`)).toBeTruthy();
  });

  it("includes the selected game type in the emitted payload", async () => {
    render(<CreateGameScreen />);
    const razz = GAME_REGISTRY.find((v) => v.id === "razz")!;
    fireEvent.press(screen.getByTestId(`variant-${razz.id}`));
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "create-room",
        expect.objectContaining({ gameType: "razz" })
      )
    );
  });

  it("updates the game summary variant when a new variant is selected", () => {
    render(<CreateGameScreen />);
    const razz = GAME_REGISTRY.find((v) => v.id === "razz")!;
    fireEvent.press(screen.getByTestId(`variant-${razz.id}`));
    expect(screen.getByTestId("summary-variant").props.children).toBe("Razz");
  });
});

// ─── Description expand/collapse ─────────────────────────────────────────────

describe("CreateGameScreen — description expand/collapse", () => {
  it("shows the description when the info button is pressed", () => {
    render(<CreateGameScreen />);
    const first = GAME_REGISTRY[0]!;
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.getByTestId(`desc-${first.id}`)).toBeTruthy();
    expect(screen.getByText(first.description)).toBeTruthy();
  });

  it("hides the description when the info button is pressed again", () => {
    render(<CreateGameScreen />);
    const first = GAME_REGISTRY[0]!;
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.getByTestId(`desc-${first.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.queryByTestId(`desc-${first.id}`)).toBeNull();
  });

  it("only shows one description at a time", () => {
    render(<CreateGameScreen />);
    const [first, second] = GAME_REGISTRY as [typeof GAME_REGISTRY[0], typeof GAME_REGISTRY[0]];
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.getByTestId(`desc-${first.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`info-btn-${second.id}`));
    expect(screen.queryByTestId(`desc-${first.id}`)).toBeNull();
    expect(screen.getByTestId(`desc-${second.id}`)).toBeTruthy();
  });
});

// ─── Max players ──────────────────────────────────────────────────────────────

describe("CreateGameScreen — max players", () => {
  it("shows player buttons 2–5 for a 5-card game", () => {
    render(<CreateGameScreen />);
    // Default is 5-card-stud.
    for (let n = 2; n <= 5; n++) {
      expect(screen.getByTestId(`player-btn-${n}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("player-btn-6")).toBeNull();
    expect(screen.queryByTestId("player-btn-7")).toBeNull();
  });

  it("shows player buttons 2–7 after switching to a 7-card game", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("variant-7-card-stud"));
    for (let n = 2; n <= 7; n++) {
      expect(screen.getByTestId(`player-btn-${n}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("player-btn-8")).toBeNull();
  });

  it("updates the displayed value when a player count is selected", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("player-btn-3"));
    expect(screen.getByTestId("max-players-value").props.children).toBe(3);
  });

  it("includes maxPlayers in the emitted payload", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("variant-7-card-stud"));
    fireEvent.press(screen.getByTestId("player-btn-4"));
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "create-room",
        expect.objectContaining({ maxPlayers: 4 })
      )
    );
  });

  it("updates the summary player range when max players changes", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("player-btn-4"));
    expect(screen.getByTestId("summary-players").props.children).toBe("2–4");
  });
});

// ─── Buy-in selection ─────────────────────────────────────────────────────────

describe("CreateGameScreen — buy-in selection", () => {
  it("selects each preset without error", () => {
    render(<CreateGameScreen />);
    for (const amount of [500, 1000, 2500, 5000]) {
      fireEvent.press(screen.getByTestId(`buy-in-preset-${amount}`));
      expect(screen.getByTestId(`buy-in-preset-${amount}`)).toBeTruthy();
    }
  });

  it("shows the custom input when Custom is selected", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-custom"));
    expect(screen.getByTestId("input-custom-buy-in")).toBeTruthy();
  });

  it("hides the custom input when a preset is re-selected", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-custom"));
    expect(screen.getByTestId("input-custom-buy-in")).toBeTruthy();
    fireEvent.press(screen.getByTestId("buy-in-preset-500"));
    expect(screen.queryByTestId("input-custom-buy-in")).toBeNull();
  });

  it("auto-calculates rebuy min and max from the selected preset", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-preset-1000"));
    expect(screen.getByTestId("rebuy-min").props.children).toBe("$500");
    expect(screen.getByTestId("rebuy-max").props.children).toBe("$2,000");
  });

  it("updates summary buy-in when preset changes", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-preset-2500"));
    expect(screen.getByTestId("summary-buy-in").props.children).toBe("$2,500");
  });
});

// ─── Buy-in validation ────────────────────────────────────────────────────────

describe("CreateGameScreen — buy-in validation", () => {
  it("shows an error when the custom buy-in is below $100", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-custom"));
    fireEvent.changeText(screen.getByTestId("input-custom-buy-in"), "50");
    fireEvent.press(screen.getByTestId("btn-create"));

    expect(screen.getByTestId("error-message")).toBeTruthy();
    expect(screen.getByText(/Minimum buy-in/i)).toBeTruthy();
  });

  it("shows an error when the custom buy-in exceeds $10,000", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-custom"));
    fireEvent.changeText(screen.getByTestId("input-custom-buy-in"), "15000");
    fireEvent.press(screen.getByTestId("btn-create"));

    expect(screen.getByTestId("error-message")).toBeTruthy();
    expect(screen.getByText(/Maximum buy-in/i)).toBeTruthy();
  });

  it("shows an error when custom buy-in is empty", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-custom"));
    fireEvent.press(screen.getByTestId("btn-create"));

    expect(screen.getByTestId("error-message")).toBeTruthy();
  });

  it("does not emit create-room when buy-in is invalid", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-custom"));
    fireEvent.changeText(screen.getByTestId("input-custom-buy-in"), "10");
    fireEvent.press(screen.getByTestId("btn-create"));

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});

// ─── Submission ───────────────────────────────────────────────────────────────

describe("CreateGameScreen — submission", () => {
  it("emits create-room with the complete fixed payload", async () => {
    render(<CreateGameScreen />);
    // Defaults: 5-card-stud, 5 players (clamped), $1,000 buy-in.
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith("create-room", {
        gameType: GAME_REGISTRY[0]!.id,
        maxPlayers: 5,
        startingBuyIn: 1000,
        minRebuy: 500,
        maxRebuy: 2000,
        stakes: { ante: 1, bringIn: 2 },
        allowRebuys: true,
        rebuyTimeoutSeconds: 120,
        endConditions: { manualEnd: true, onePlayerRemains: true },
      })
    );
  });

  it("shows a loading spinner during submission", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));
    await waitFor(() =>
      expect(screen.getByTestId("create-spinner")).toBeTruthy()
    );
  });

  it("disables the Create Game button while submitting", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-create").props.accessibilityState?.disabled
      ).toBe(true)
    );
  });

  it("always sends fixed stakes $1/$2", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "create-room",
        expect.objectContaining({ stakes: { ante: 1, bringIn: 2 } })
      )
    );
  });

  it("always sends allowRebuys: true and rebuyTimeoutSeconds: 120", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "create-room",
        expect.objectContaining({
          allowRebuys: true,
          rebuyTimeoutSeconds: 120,
        })
      )
    );
  });

  it("includes the correct minRebuy and maxRebuy when buy-in is $2,500", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("buy-in-preset-2500"));
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "create-room",
        expect.objectContaining({
          startingBuyIn: 2500,
          minRebuy: 1250,
          maxRebuy: 5000,
        })
      )
    );
  });
});

// ─── room-created socket event ────────────────────────────────────────────────

describe("CreateGameScreen — room-created socket event", () => {
  it("navigates to the game room with the received roomId", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await act(async () => {
      emitSocket("room-created", { roomId: "room-xyz" });
    });

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/(app)/game/room-xyz")
    );
  });

  it("hides the loading spinner after room-created fires", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await act(async () => {
      emitSocket("room-created", { roomId: "room-xyz" });
    });

    await waitFor(() =>
      expect(screen.queryByTestId("create-spinner")).toBeNull()
    );
  });
});

// ─── create-room-error socket event ──────────────────────────────────────────

describe("CreateGameScreen — create-room-error socket event", () => {
  it("shows the server error message", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await act(async () => {
      emitSocket("create-room-error", { message: "Room limit reached." });
    });

    await waitFor(() =>
      expect(screen.getByText("Room limit reached.")).toBeTruthy()
    );
  });

  it("shows a fallback message when no message is provided", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await act(async () => {
      emitSocket("create-room-error", {});
    });

    await waitFor(() =>
      expect(screen.getByText(/Failed to create room/i)).toBeTruthy()
    );
  });

  it("clears the loading spinner after an error event", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await act(async () => {
      emitSocket("create-room-error", { message: "Oops" });
    });

    await waitFor(() =>
      expect(screen.queryByTestId("create-spinner")).toBeNull()
    );
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe("CreateGameScreen — server timeout", () => {
  it("shows a timeout error if no response arrives within 10 s", async () => {
    jest.useFakeTimers();
    const origSetTimeout = global.setTimeout.bind(global);
    let timeoutCb: (() => void) | null = null;

    jest.spyOn(global, "setTimeout").mockImplementation((fn, ms, ...args) => {
      if (ms === 10_000) {
        timeoutCb = fn as () => void;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return origSetTimeout(fn, ms, ...args);
    });

    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-create"));

    await act(async () => { timeoutCb?.(); });

    await waitFor(() =>
      expect(screen.getByText(/Server did not respond/i)).toBeTruthy()
    );
  });
});

// ─── Cancel ───────────────────────────────────────────────────────────────────

describe("CreateGameScreen — cancel", () => {
  it("navigates back when Cancel is pressed", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-cancel"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("does not emit create-room when Cancel is pressed", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("btn-cancel"));
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});

// ─── Stakes display ───────────────────────────────────────────────────────────

describe("CreateGameScreen — fixed stakes display", () => {
  it("always displays $1/$2 in the summary regardless of any selection", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("summary-stakes").props.children).toBe("$1/$2");
  });

  it("displays the fixed stakes card with $1 / $2", () => {
    render(<CreateGameScreen />);
    expect(screen.getByText("$1 / $2")).toBeTruthy();
    expect(screen.getByText("Fixed for all games")).toBeTruthy();
  });
});
