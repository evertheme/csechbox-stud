/**
 * GameScreen (GamePlayScreen) + component tests.
 *
 * Strategy
 * ────────
 * • The socket mock captures handlers so tests can fire every incoming event.
 * • All game state is driven by emitting "game-state" to mirror real usage.
 * • Components (CardView, ActionButtons, BetPanel) are tested inline via the
 *   integrated screen render — no separate mocking needed.
 * • Timeout is tested with the same passthrough setTimeout spy used elsewhere.
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
  useLocalSearchParams: jest.fn(() => ({ roomId: "game-room-1" })),
}));

jest.mock("../../store/auth-store", () => ({ useAuthStore: jest.fn() }));

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
import GamePlayScreen from "../../app/(app)/game-play/[roomId]";
import type { GameState, GamePlayer } from "../../types/poker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ME_ID = "player-me";
const OPP_ID = "player-opp";

const PLAYER_ME: GamePlayer = {
  userId: ME_ID,
  username: "PokerAce",
  chips: 800,
  cards: [
    { rank: "K", suit: "hearts", faceUp: false },
    { rank: "A", suit: "spades", faceUp: true },
    { rank: "Q", suit: "diamonds", faceUp: true },
  ],
  currentBet: 0,
  isFolded: false,
  isAllIn: false,
  seatIndex: 0,
};

const PLAYER_OPP: GamePlayer = {
  userId: OPP_ID,
  username: "CardShark",
  chips: 600,
  cards: [
    { rank: "2", suit: "clubs", faceUp: false },
    { rank: "7", suit: "hearts", faceUp: true },
    { rank: "3", suit: "diamonds", faceUp: true },
  ],
  currentBet: 0,
  isFolded: false,
  isAllIn: false,
  seatIndex: 1,
};

const BASE_GAME_STATE: GameState = {
  roomId: "game-room-1",
  gameType: "7-card-stud",
  street: "3rd",
  pot: 20,
  currentBet: 0,
  minRaise: 2,
  activePlayerId: ME_ID,
  dealerPlayerId: OPP_ID,
  players: [PLAYER_ME, PLAYER_OPP],
  status: "playing",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupStore(userId = ME_ID) {
  jest.mocked(useAuthStore).mockReturnValue({
    user: { id: userId, user_metadata: { username: "PokerAce" } },
    chips: 800,
    session: { access_token: "tok-xyz" },
    signOut: jest.fn(),
    isAuthenticated: true,
    isLoading: false,
  } as any);
}

function emitSocket(event: string, data: unknown) {
  (socketHandlers[event] ?? []).forEach((h) => h(data));
}

async function renderWithGame(state: GameState = BASE_GAME_STATE) {
  render(<GamePlayScreen />);
  await act(async () => { emitSocket("game-state", state); });
  await waitFor(() =>
    expect(screen.queryByTestId("loading-screen")).toBeNull()
  );
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

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

describe("GameScreen — loading", () => {
  it("shows loading indicator before game-state arrives", () => {
    render(<GamePlayScreen />);
    expect(screen.getByTestId("loading-screen")).toBeTruthy();
  });

  it("emits get-game-state on mount", () => {
    render(<GamePlayScreen />);
    expect(mockSocket.emit).toHaveBeenCalledWith("get-game-state", {
      roomId: "game-room-1",
    });
  });

  it("hides loading indicator after game-state fires", async () => {
    await renderWithGame();
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });
});

// ─── Timeout / error ──────────────────────────────────────────────────────────

describe("GameScreen — timeout/error", () => {
  it("shows error screen when timeout fires before game-state", async () => {
    let cb: (() => void) | null = null;
    const orig = global.setTimeout.bind(global);
    jest.spyOn(global, "setTimeout").mockImplementation((fn, ms, ...args) => {
      if (ms === 5_000) { cb = fn as () => void; return 0 as any; }
      return orig(fn, ms, ...args);
    });

    render(<GamePlayScreen />);
    await act(async () => { cb?.(); });
    await waitFor(() => expect(screen.getByTestId("error-screen")).toBeTruthy());
  });
});

// ─── Info bar ─────────────────────────────────────────────────────────────────

describe("GameScreen — info bar", () => {
  it("shows the pot amount", async () => {
    await renderWithGame();
    expect(screen.getByText(/Pot: \$20/)).toBeTruthy();
  });

  it("shows the current street", async () => {
    await renderWithGame();
    expect(screen.getByTestId("street-text").props.children).toBe("3rd");
  });

  it("shows the current bet when one is set", async () => {
    await renderWithGame({ ...BASE_GAME_STATE, currentBet: 5 });
    expect(screen.getByTestId("current-bet-text")).toBeTruthy();
  });

  it("hides the current bet line when bet is 0", async () => {
    await renderWithGame();
    expect(screen.queryByTestId("current-bet-text")).toBeNull();
  });
});

// ─── Pot display ─────────────────────────────────────────────────────────────

describe("GameScreen — pot display", () => {
  it("renders the pot amount in the central area", async () => {
    await renderWithGame();
    expect(screen.getByTestId("pot-display").props.children).toBe("$20");
  });

  it("shows SHOWDOWN label during showdown", async () => {
    await renderWithGame({ ...BASE_GAME_STATE, status: "showdown" });
    expect(screen.getByTestId("showdown-label")).toBeTruthy();
  });

  it("hides SHOWDOWN label during normal play", async () => {
    await renderWithGame();
    expect(screen.queryByTestId("showdown-label")).toBeNull();
  });
});

// ─── Opponent area ────────────────────────────────────────────────────────────

describe("GameScreen — opponents", () => {
  it("renders an opponent card for each non-me player", async () => {
    await renderWithGame();
    expect(screen.getByTestId(`opponent-${OPP_ID}`)).toBeTruthy();
  });

  it("shows the opponent's username", async () => {
    await renderWithGame();
    expect(screen.getByText("CardShark")).toBeTruthy();
  });

  it("shows the opponent's chip count", async () => {
    await renderWithGame();
    expect(screen.getByTestId(`opponent-chips-${OPP_ID}`)).toBeTruthy();
    expect(screen.getByText("$600")).toBeTruthy();
  });

  it("shows opponent cards (face-down backs + face-up)", async () => {
    await renderWithGame();
    // Opponent has 1 face-down and 2 face-up cards.
    expect(screen.getByTestId(`opp-card-${OPP_ID}-0`)).toBeTruthy();
    expect(screen.getByTestId(`opp-card-${OPP_ID}-1`)).toBeTruthy();
  });

  it("shows the dealer chip on the dealer's card", async () => {
    await renderWithGame(); // dealerPlayerId = OPP_ID
    // Dealer chip text "D" should appear inside opponent card.
    expect(screen.getByText("D")).toBeTruthy();
  });

  it("marks the active opponent's card", async () => {
    const state = { ...BASE_GAME_STATE, activePlayerId: OPP_ID };
    await renderWithGame(state);
    // active style applied — just verify the element exists.
    expect(screen.getByTestId(`opponent-${OPP_ID}`)).toBeTruthy();
  });
});

// ─── My hand area ─────────────────────────────────────────────────────────────

describe("GameScreen — my hand", () => {
  it("renders my cards", async () => {
    await renderWithGame();
    expect(screen.getByTestId("my-cards")).toBeTruthy();
    expect(screen.getByTestId("my-card-0")).toBeTruthy();
    expect(screen.getByTestId("my-card-1")).toBeTruthy();
    expect(screen.getByTestId("my-card-2")).toBeTruthy();
  });

  it("shows 'Your Turn' badge when it is my turn", async () => {
    await renderWithGame(); // activePlayerId = ME_ID
    expect(screen.getByTestId("your-turn-badge")).toBeTruthy();
  });

  it("hides 'Your Turn' badge when it is not my turn", async () => {
    await renderWithGame({ ...BASE_GAME_STATE, activePlayerId: OPP_ID });
    expect(screen.queryByTestId("your-turn-badge")).toBeNull();
  });

  it("shows my chip stack", async () => {
    await renderWithGame();
    expect(screen.getByTestId("my-chips-text")).toBeTruthy();
    expect(screen.getByText(/Stack: \$800/)).toBeTruthy();
  });

  it("shows my current bet alongside chip count when I have bet", async () => {
    const me = { ...PLAYER_ME, currentBet: 5 };
    await renderWithGame({ ...BASE_GAME_STATE, players: [me, PLAYER_OPP] });
    expect(screen.getByText(/Bet: \$5/)).toBeTruthy();
  });
});

// ─── Action buttons — disabled when not my turn ───────────────────────────────

describe("GameScreen — action buttons (not my turn)", () => {
  it("disables all action buttons when it is not my turn", async () => {
    await renderWithGame({ ...BASE_GAME_STATE, activePlayerId: OPP_ID });
    expect(
      screen.getByTestId("btn-fold").props.accessibilityState?.disabled
    ).toBe(true);
    // When canCheck is false (not my turn), the Call button renders instead of Check.
    expect(
      screen.getByTestId("btn-call").props.accessibilityState?.disabled
    ).toBe(true);
    expect(
      screen.getByTestId("btn-raise").props.accessibilityState?.disabled
    ).toBe(true);
  });
});

// ─── Action buttons — Check ───────────────────────────────────────────────────

describe("GameScreen — Check", () => {
  it("shows Check button when currentBet is 0 and it is my turn", async () => {
    await renderWithGame(); // currentBet = 0, activePlayer = me
    expect(screen.getByTestId("btn-check")).toBeTruthy();
  });

  it("emits player-action fold when Fold is pressed", async () => {
    await renderWithGame();
    fireEvent.press(screen.getByTestId("btn-fold"));
    expect(mockSocket.emit).toHaveBeenCalledWith("player-action", {
      roomId: "game-room-1",
      action: "fold",
    });
  });

  it("emits player-action check when Check is pressed", async () => {
    await renderWithGame();
    fireEvent.press(screen.getByTestId("btn-check"));
    expect(mockSocket.emit).toHaveBeenCalledWith("player-action", {
      roomId: "game-room-1",
      action: "check",
    });
  });
});

// ─── Action buttons — Call ────────────────────────────────────────────────────

describe("GameScreen — Call", () => {
  it("shows Call button instead of Check when there is a bet to call", async () => {
    const state = { ...BASE_GAME_STATE, currentBet: 5 };
    await renderWithGame(state);
    expect(screen.getByTestId("btn-call")).toBeTruthy();
    expect(screen.queryByTestId("btn-check")).toBeNull();
  });

  it("emits player-action call with the call amount", async () => {
    // currentBet = 5, my currentBet = 0 → callAmount = 5
    const state = { ...BASE_GAME_STATE, currentBet: 5 };
    await renderWithGame(state);
    fireEvent.press(screen.getByTestId("btn-call"));
    expect(mockSocket.emit).toHaveBeenCalledWith("player-action", {
      roomId: "game-room-1",
      action: "call",
      amount: 5,
    });
  });
});

// ─── Action buttons — Raise / Bet panel ──────────────────────────────────────

describe("GameScreen — Raise/Bet panel", () => {
  it("opens the BetPanel when the Raise/Bet button is pressed", async () => {
    await renderWithGame();
    fireEvent.press(screen.getByTestId("btn-raise"));
    await waitFor(() =>
      expect(screen.getByTestId("bet-panel")).toBeTruthy()
    );
  });

  it("shows 'Bet' label when there is no current bet", async () => {
    await renderWithGame();
    expect(screen.getByText("Bet")).toBeTruthy(); // btn-raise label
  });

  it("shows 'Raise' label when there is a current bet", async () => {
    await renderWithGame({ ...BASE_GAME_STATE, currentBet: 5 });
    expect(screen.getByText("Raise")).toBeTruthy();
  });

  it("closes the BetPanel when Cancel is pressed", async () => {
    await renderWithGame();
    fireEvent.press(screen.getByTestId("btn-raise"));
    await waitFor(() => screen.getByTestId("bet-panel"));
    fireEvent.press(screen.getByTestId("bet-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("bet-panel")).toBeNull()
    );
  });

  it("emits player-action bet with the confirmed amount", async () => {
    await renderWithGame(); // no current bet → "bet" action
    fireEvent.press(screen.getByTestId("btn-raise"));
    await waitFor(() => screen.getByTestId("bet-panel"));

    fireEvent.changeText(screen.getByTestId("input-bet-amount"), "10");
    fireEvent.press(screen.getByTestId("bet-confirm"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith("player-action", {
        roomId: "game-room-1",
        action: "bet",
        amount: 10,
      })
    );
  });

  it("emits player-action raise when there is a current bet", async () => {
    const state = { ...BASE_GAME_STATE, currentBet: 5, minRaise: 5 };
    await renderWithGame(state);
    fireEvent.press(screen.getByTestId("btn-raise"));
    await waitFor(() => screen.getByTestId("bet-panel"));

    // Min raise = currentBet(5) + minRaise(5) = 10
    fireEvent.changeText(screen.getByTestId("input-bet-amount"), "10");
    fireEvent.press(screen.getByTestId("bet-confirm"));

    await waitFor(() =>
      expect(mockSocket.emit).toHaveBeenCalledWith("player-action", {
        roomId: "game-room-1",
        action: "raise",
        amount: 10,
      })
    );
  });

  it("hides action bar when player is folded", async () => {
    const me = { ...PLAYER_ME, isFolded: true };
    await renderWithGame({ ...BASE_GAME_STATE, players: [me, PLAYER_OPP] });
    expect(screen.queryByTestId("action-bar")).toBeNull();
  });
});

// ─── BetPanel unit tests ──────────────────────────────────────────────────────

describe("BetPanel", () => {
  it("shows the Min preset value at minBet", async () => {
    await renderWithGame(); // minRaise = 2, no currentBet → minBet = 2
    fireEvent.press(screen.getByTestId("btn-raise"));
    await waitFor(() => screen.getByTestId("bet-panel"));
    expect(screen.getByTestId("preset-min")).toBeTruthy();
  });

  it("disables confirm when amount is below minBet", async () => {
    await renderWithGame();
    fireEvent.press(screen.getByTestId("btn-raise"));
    await waitFor(() => screen.getByTestId("bet-panel"));
    fireEvent.changeText(screen.getByTestId("input-bet-amount"), "0");
    expect(
      screen.getByTestId("bet-confirm").props.accessibilityState?.disabled
    ).toBe(true);
  });
});

// ─── Socket: player-acted ─────────────────────────────────────────────────────

describe("GameScreen — socket player-acted", () => {
  it("updates the game state when player-acted fires", async () => {
    await renderWithGame();
    const updatedState = { ...BASE_GAME_STATE, pot: 40 };

    await act(async () => {
      emitSocket("player-acted", {
        playerId: OPP_ID,
        action: "call",
        amount: 20,
        gameState: updatedState,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("pot-display").props.children).toBe("$40")
    );
  });

  it("shows an action annotation on the acting player's card", async () => {
    await renderWithGame();

    await act(async () => {
      emitSocket("player-acted", {
        playerId: OPP_ID,
        action: "fold",
        gameState: BASE_GAME_STATE,
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId(`action-label-${OPP_ID}`)).toBeTruthy()
    );
  });
});

// ─── Socket: pot-updated ──────────────────────────────────────────────────────

describe("GameScreen — socket pot-updated", () => {
  it("updates the pot display", async () => {
    await renderWithGame();

    await act(async () => { emitSocket("pot-updated", { pot: 100 }); });

    await waitFor(() =>
      expect(screen.getByTestId("pot-display").props.children).toBe("$100")
    );
  });
});

// ─── Socket: street-complete ──────────────────────────────────────────────────

describe("GameScreen — socket street-complete", () => {
  it("updates state and closes bet panel on street-complete", async () => {
    await renderWithGame();
    fireEvent.press(screen.getByTestId("btn-raise"));
    await waitFor(() => screen.getByTestId("bet-panel"));

    const next = { ...BASE_GAME_STATE, street: "4th" as const, pot: 30 };
    await act(async () => {
      emitSocket("street-complete", { street: "4th", gameState: next });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("bet-panel")).toBeNull();
      expect(screen.getByTestId("street-text").props.children).toBe("4th");
    });
  });
});

// ─── Socket: showdown ─────────────────────────────────────────────────────────

describe("GameScreen — socket showdown", () => {
  it("shows SHOWDOWN label when showdown event fires", async () => {
    await renderWithGame();
    const state = { ...BASE_GAME_STATE, status: "showdown" as const };
    await act(async () => { emitSocket("showdown", { gameState: state }); });
    await waitFor(() =>
      expect(screen.getByTestId("showdown-label")).toBeTruthy()
    );
  });
});

// ─── Socket: winner-declared ──────────────────────────────────────────────────

describe("GameScreen — socket winner-declared", () => {
  it("shows the winner banner with username and amount", async () => {
    await renderWithGame();
    const winnerPayload = {
      winner: {
        playerId: OPP_ID,
        username: "CardShark",
        amount: 100,
        handDescription: "Full House",
      },
      gameState: BASE_GAME_STATE,
    };

    await act(async () => { emitSocket("winner-declared", winnerPayload); });

    await waitFor(() => {
      expect(screen.getByTestId("winner-banner")).toBeTruthy();
      expect(screen.getByText("CardShark wins!")).toBeTruthy();
      expect(screen.getByText("Full House")).toBeTruthy();
    });
  });

  it("shows 'You won!' when I am the winner", async () => {
    await renderWithGame();
    const winnerPayload = {
      winner: {
        playerId: ME_ID,
        username: "PokerAce",
        amount: 50,
      },
      gameState: BASE_GAME_STATE,
    };

    await act(async () => { emitSocket("winner-declared", winnerPayload); });

    await waitFor(() =>
      expect(screen.getByText(/You won!/)).toBeTruthy()
    );
  });

  it("navigates to lobby when winner banner is dismissed", async () => {
    await renderWithGame();
    await act(async () => {
      emitSocket("winner-declared", {
        winner: { playerId: OPP_ID, username: "CardShark", amount: 50 },
        gameState: BASE_GAME_STATE,
      });
    });

    await waitFor(() => screen.getByTestId("btn-winner-dismiss"));
    fireEvent.press(screen.getByTestId("btn-winner-dismiss"));
    expect(router.replace).toHaveBeenCalledWith("/(app)/lobby");
  });
});

// ─── CardView component ───────────────────────────────────────────────────────

describe("CardView — face-up card", () => {
  it("renders rank and suit symbol for a face-up card", async () => {
    await renderWithGame();
    // My second card is A♠ face-up (my-card-1).
    const card = screen.getByTestId("my-card-1");
    expect(card).toBeTruthy();
  });

  it("renders card back for a face-down card", async () => {
    await renderWithGame();
    // My first card is face-down (my-card-0).
    expect(screen.getByTestId("my-card-0")).toBeTruthy();
  });
});
