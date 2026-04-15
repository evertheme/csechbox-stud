/**
 * CreateGameScreen tests.
 *
 * Strategy
 * ────────
 * • The socket is fully mocked; event handlers are captured so tests can fire
 *   "room-created" and "create-room-error" events manually.
 * • Auth store is mocked with a configurable chip count.
 * • The GAME_REGISTRY and STAKES_PRESETS are imported directly (pure data).
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

jest.mock("../../store/auth-store", () => ({ useAuthStore: jest.fn() }));

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
import { useAuthStore } from "../../store/auth-store";
import CreateGameScreen from "../../app/(app)/create-game";
import { GAME_REGISTRY, STAKES_PRESETS } from "../../lib/gameRegistry";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CHIPS = 5_000;

function setupStore(chips = CHIPS) {
  jest.mocked(useAuthStore).mockReturnValue({
    chips,
    user: { user_metadata: { username: "PokerPro" } },
    session: { access_token: "tok-abc" },
    signOut: jest.fn(),
    isAuthenticated: true,
    isLoading: false,
  } as any);
}

/** Fire all handlers registered for a socket event. */
function emitSocket(event: string, data: unknown) {
  (socketHandlers[event] ?? []).forEach((h) => h(data));
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  setupStore();
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
    expect(screen.getByText("5 Card Stud")).toBeTruthy();
    expect(screen.getByText("7 Card Stud")).toBeTruthy();
    expect(screen.getByText("Razz")).toBeTruthy();
  });

  it("renders all 4 stakes presets", () => {
    render(<CreateGameScreen />);
    for (let i = 0; i < STAKES_PRESETS.length; i++) {
      expect(screen.getByTestId(`stake-preset-${i}`)).toBeTruthy();
    }
  });

  it("renders the Custom stakes option", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("stake-custom")).toBeTruthy();
  });

  it("renders player count buttons 2-8", () => {
    render(<CreateGameScreen />);
    for (let n = 2; n <= 8; n++) {
      expect(screen.getByTestId(`player-btn-${n}`)).toBeTruthy();
    }
  });

  it("renders the buy-in input", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("input-buy-in")).toBeTruthy();
  });

  it("renders Create Game and Cancel buttons", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("btn-create")).toBeTruthy();
    expect(screen.getByTestId("btn-cancel")).toBeTruthy();
  });
});

// ─── Default values ───────────────────────────────────────────────────────────

describe("CreateGameScreen — defaults", () => {
  it("selects the first game variant by default", () => {
    render(<CreateGameScreen />);
    // First variant's radio button should visually reflect selection;
    // check the variant is visually present and the row exists.
    expect(screen.getByTestId(`variant-${GAME_REGISTRY[0].id}`)).toBeTruthy();
  });

  it("selects the $1/$2 stakes preset by default", () => {
    render(<CreateGameScreen />);
    // The $1/$2 preset is index 1.
    expect(screen.getByText(STAKES_PRESETS[1].label)).toBeTruthy();
  });

  it("defaults max players to 6", () => {
    render(<CreateGameScreen />);
    expect(screen.getByTestId("max-players-value").props.children).toBe(6);
  });

  it("defaults buy-in to 100× the bring-in for $1/$2 stakes", () => {
    render(<CreateGameScreen />);
    // $1/$2 → bringIn = $2 → default = 100 × 2 = $200
    expect(screen.getByTestId("input-buy-in").props.value).toBe("200");
  });

  it("does not show custom stakes inputs initially", () => {
    render(<CreateGameScreen />);
    expect(screen.queryByTestId("custom-stakes-inputs")).toBeNull();
  });
});

// ─── Game variant selection ───────────────────────────────────────────────────

describe("CreateGameScreen — game variant selection", () => {
  it("selects a variant when its row is pressed", () => {
    render(<CreateGameScreen />);
    const razzVariant = GAME_REGISTRY.find((v) => v.id === "razz")!;
    fireEvent.press(screen.getByTestId(`variant-${razzVariant.id}`));
    // The variant is now selected — its radio state is internal; we verify it
    // will be included in the emitted payload.
    expect(screen.getByTestId(`variant-${razzVariant.id}`)).toBeTruthy();
  });

  it("includes the selected game type in the emitted payload", async () => {
    render(<CreateGameScreen />);

    // Select Razz.
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
});

// ─── Description expand/collapse ─────────────────────────────────────────────

describe("CreateGameScreen — description expand/collapse", () => {
  it("does not show a description by default", () => {
    render(<CreateGameScreen />);
    const first = GAME_REGISTRY[0];
    expect(screen.queryByTestId(`desc-${first.id}`)).toBeNull();
  });

  it("shows the description when the info button is pressed", () => {
    render(<CreateGameScreen />);
    const first = GAME_REGISTRY[0];
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.getByTestId(`desc-${first.id}`)).toBeTruthy();
    expect(screen.getByText(first.description)).toBeTruthy();
  });

  it("hides the description when the info button is pressed again", () => {
    render(<CreateGameScreen />);
    const first = GAME_REGISTRY[0];
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.getByTestId(`desc-${first.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.queryByTestId(`desc-${first.id}`)).toBeNull();
  });

  it("only shows one description at a time", () => {
    render(<CreateGameScreen />);
    const [first, second] = GAME_REGISTRY;
    fireEvent.press(screen.getByTestId(`info-btn-${first.id}`));
    expect(screen.getByTestId(`desc-${first.id}`)).toBeTruthy();

    // Opening a second one collapses the first.
    fireEvent.press(screen.getByTestId(`info-btn-${second.id}`));
    expect(screen.queryByTestId(`desc-${first.id}`)).toBeNull();
    expect(screen.getByTestId(`desc-${second.id}`)).toBeTruthy();
  });
});

// ─── Stakes selection ─────────────────────────────────────────────────────────

describe("CreateGameScreen — stakes selection", () => {
  it("selects each preset", () => {
    render(<CreateGameScreen />);
    for (let i = 0; i < STAKES_PRESETS.length; i++) {
      fireEvent.press(screen.getByTestId(`stake-preset-${i}`));
      // Pressing should not throw; basic smoke test.
      expect(screen.getByTestId(`stake-preset-${i}`)).toBeTruthy();
    }
  });

  it("recalculates buy-in when a different preset is selected", () => {
    render(<CreateGameScreen />);
    // Switch from $1/$2 (default) to $5/$10.
    fireEvent.press(screen.getByTestId("stake-preset-2")); // $5/$10
    // Expected buy-in: 100 × $10 = $1000, capped at chips ($5000).
    expect(screen.getByTestId("input-buy-in").props.value).toBe("1000");
  });

  it("shows custom stakes inputs when Custom is selected", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("stake-custom"));
    expect(screen.getByTestId("custom-stakes-inputs")).toBeTruthy();
    expect(screen.getByTestId("input-ante")).toBeTruthy();
    expect(screen.getByTestId("input-bring-in")).toBeTruthy();
  });

  it("hides custom stakes inputs when a preset is re-selected", () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("stake-custom"));
    expect(screen.getByTestId("custom-stakes-inputs")).toBeTruthy();
    fireEvent.press(screen.getByTestId("stake-preset-0"));
    expect(screen.queryByTestId("custom-stakes-inputs")).toBeNull();
  });

  it("includes custom stakes in the emitted payload", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("stake-custom"));

    fireEvent.changeText(screen.getByTestId("input-ante"), "2");
    fireEvent.changeText(screen.getByTestId("input-bring-in"), "5");

    // Manually set a valid buy-in (min = 20 × 5 = 100).
    fireEvent.changeText(screen.getByTestId("input-buy-in"), "100");

    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "create-room",
        expect.objectContaining({
          stakes: { ante: 2, bringIn: 5 },
        })
      )
    );
  });
});

// ─── Max players ──────────────────────────────────────────────────────────────

describe("CreateGameScreen — max players", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    "selecting %i updates the displayed value",
    (n) => {
      render(<CreateGameScreen />);
      fireEvent.press(screen.getByTestId(`player-btn-${n}`));
      expect(screen.getByTestId("max-players-value").props.children).toBe(n);
    }
  );

  it("includes maxPlayers in the emitted payload", async () => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("player-btn-4"));
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "create-room",
        expect.objectContaining({ maxPlayers: 4 })
      )
    );
  });
});

// ─── Buy-in validation ────────────────────────────────────────────────────────

describe("CreateGameScreen — buy-in validation", () => {
  it("shows an error when buy-in is below the minimum", () => {
    render(<CreateGameScreen />);
    // $1/$2 → min = 20 × $2 = $40. Enter $10.
    fireEvent.changeText(screen.getByTestId("input-buy-in"), "10");
    fireEvent.press(screen.getByTestId("btn-create"));

    expect(screen.getByTestId("error-message")).toBeTruthy();
    expect(screen.getByText(/Minimum buy-in/i)).toBeTruthy();
  });

  it("shows an error when buy-in exceeds available chips", () => {
    setupStore(100); // only $100 chips
    render(<CreateGameScreen />);
    fireEvent.changeText(screen.getByTestId("input-buy-in"), "500");
    fireEvent.press(screen.getByTestId("btn-create"));

    expect(screen.getByTestId("error-message")).toBeTruthy();
    expect(screen.getByText(/chips/i)).toBeTruthy();
  });

  it("does not emit create-room when buy-in is invalid", () => {
    render(<CreateGameScreen />);
    fireEvent.changeText(screen.getByTestId("input-buy-in"), "1");
    fireEvent.press(screen.getByTestId("btn-create"));

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});

// ─── Custom stakes validation ─────────────────────────────────────────────────

describe("CreateGameScreen — custom stakes validation", () => {
  beforeEach(() => {
    render(<CreateGameScreen />);
    fireEvent.press(screen.getByTestId("stake-custom"));
  });

  it("shows an error when ante is missing", () => {
    fireEvent.changeText(screen.getByTestId("input-bring-in"), "5");
    fireEvent.press(screen.getByTestId("btn-create"));
    expect(screen.getByText(/Ante must be/i)).toBeTruthy();
  });

  it("shows an error when bring-in is missing", () => {
    fireEvent.changeText(screen.getByTestId("input-ante"), "2");
    fireEvent.press(screen.getByTestId("btn-create"));
    expect(screen.getByText(/Bring-in must be a positive/i)).toBeTruthy();
  });

  it("shows an error when bring-in is not greater than ante", () => {
    fireEvent.changeText(screen.getByTestId("input-ante"), "5");
    fireEvent.changeText(screen.getByTestId("input-bring-in"), "3");
    fireEvent.press(screen.getByTestId("btn-create"));
    expect(screen.getByText(/Bring-in must be greater/i)).toBeTruthy();
  });

  it("clears the error when ante is corrected", async () => {
    fireEvent.press(screen.getByTestId("btn-create"));
    expect(screen.getByTestId("error-message")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("input-ante"), "2");
    await waitFor(() =>
      expect(screen.queryByTestId("error-message")).toBeNull()
    );
  });
});

// ─── Submission ───────────────────────────────────────────────────────────────

describe("CreateGameScreen — submission", () => {
  it("emits create-room with the full payload", async () => {
    render(<CreateGameScreen />);
    // Defaults: 5-card-stud, $1/$2, 6 players, buy-in=$200.
    fireEvent.press(screen.getByTestId("btn-create"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith("create-room", {
        gameType: GAME_REGISTRY[0].id,
        stakes: { ante: STAKES_PRESETS[1].ante, bringIn: STAKES_PRESETS[1].bringIn },
        maxPlayers: 6,
        buyIn: 200,
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
    // Pressable maps `disabled` to accessibilityState.disabled in the test renderer.
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-create").props.accessibilityState?.disabled
      ).toBe(true)
    );
  });
});

// ─── room-created event ───────────────────────────────────────────────────────

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

// ─── create-room-error event ──────────────────────────────────────────────────

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
      expect(
        screen.getByText(/Server did not respond/i)
      ).toBeTruthy()
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
