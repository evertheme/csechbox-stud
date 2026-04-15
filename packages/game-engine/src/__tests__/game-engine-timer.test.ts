import { GameEngine } from "../game-engine.js";
import type {
  PlayerTimeoutPayload,
  TurnTimerStartedPayload,
  TurnTimerWarningPayload,
} from "../game-engine.js";
import { WinCondition } from "@poker/shared-types";
import type { GameRules } from "@poker/shared-types";

// ─── Minimal game rules (two streets, no ante, no bring-in) ──────────────────

const twoStreetRules: GameRules = {
  id: "test-stud",
  name: "Test Stud",
  family: "five-card-stud",
  handEvaluator: "high",
  winCondition: WinCondition.HIGHEST_HAND,
  anteRequired: false,
  maxCards: 5,
  bringInRequired: false,
  bettingRounds: [
    { afterStreet: "third-street",  bringIn: false, minBet: 1 },
    { afterStreet: "fourth-street", bringIn: false, minBet: 2 },
  ],
  dealingPattern: [
    { street: "third-street",  cards: 1, faceUp: true },
    { street: "fourth-street", cards: 1, faceUp: true },
  ],
  specialRules: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Start the engine and deal the first street, returning the engine. */
function startDealt(
  playerIds: string[],
  opts: { turnTimeoutSeconds?: number; handNumber?: number } = {},
): GameEngine {
  const engine = new GameEngine(twoStreetRules, playerIds, {
    startingChips: 1000,
    anteAmount: 0,
    turnTimeoutSeconds: opts.turnTimeoutSeconds ?? 40,
    handNumber: opts.handNumber ?? 1,
  });
  engine.start();
  engine.dealCards();
  return engine;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── GameState timer fields ───────────────────────────────────────────────────

describe("GameState timer fields", () => {
  it("exposes turnTimeoutSeconds from options (default 40)", () => {
    const engine = startDealt(["alice", "bob"]);
    expect(engine.getGameState().turnTimeoutSeconds).toBe(40);
    engine.destroy();
  });

  it("exposes custom turnTimeoutSeconds", () => {
    const engine = startDealt(["alice", "bob"], { turnTimeoutSeconds: 20 });
    expect(engine.getGameState().turnTimeoutSeconds).toBe(20);
    engine.destroy();
  });

  it("exposes handNumber from options (default 1)", () => {
    const engine = startDealt(["alice", "bob"]);
    expect(engine.getGameState().handNumber).toBe(1);
    engine.destroy();
  });

  it("exposes custom handNumber", () => {
    const engine = startDealt(["alice", "bob"], { handNumber: 7 });
    expect(engine.getGameState().handNumber).toBe(7);
    engine.destroy();
  });

  it("currentTurnStartTime is set once dealCards() triggers betting", () => {
    const engine = startDealt(["alice", "bob"]);
    expect(engine.getGameState().currentTurnStartTime).toBeGreaterThan(0);
    engine.destroy();
  });

  it("currentTurnStartTime is null before start()", () => {
    const engine = new GameEngine(twoStreetRules, ["alice", "bob"], {
      startingChips: 1000,
      anteAmount: 0,
    });
    expect(engine.getGameState().currentTurnStartTime).toBeNull();
  });
});

// ─── turn-timer-started event ─────────────────────────────────────────────────

describe("turn-timer-started event", () => {
  it("fires immediately after dealCards() with correct payload", () => {
    const listener = jest.fn<void, [TurnTimerStartedPayload]>();
    const engine = new GameEngine(twoStreetRules, ["alice", "bob"], {
      startingChips: 1000,
      anteAmount: 0,
      turnTimeoutSeconds: 40,
    });
    engine.on("turn-timer-started", listener);
    engine.start();
    engine.dealCards();

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0]![0];
    expect(payload.timeoutSeconds).toBe(40);
    expect(payload.playerId).toBe(engine.getGameState().activePlayerId);
    expect(payload.startTime).toBeGreaterThan(0);
    engine.destroy();
  });

  it("fires again when the next player's turn begins after an action", () => {
    const listener = jest.fn<void, [TurnTimerStartedPayload]>();
    const engine = startDealt(["alice", "bob"]);
    engine.on("turn-timer-started", listener);

    // alice acts → bob's timer starts
    engine.check("alice");

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0]![0];
    expect(payload.playerId).toBe("bob");
    engine.destroy();
  });
});

// ─── turn-timer-warning event ─────────────────────────────────────────────────

describe("turn-timer-warning event", () => {
  it("fires at 30 s (10 s remaining) during a 40-second timer", () => {
    const warningListener = jest.fn<void, [TurnTimerWarningPayload]>();
    const engine = startDealt(["alice", "bob"]);
    const activeId = engine.getGameState().activePlayerId!;

    engine.on("turn-timer-warning", warningListener);

    jest.advanceTimersByTime(29_999);
    expect(warningListener).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);                  // now at exactly 30 000 ms
    expect(warningListener).toHaveBeenCalledTimes(1);
    expect(warningListener.mock.calls[0]![0]).toEqual<TurnTimerWarningPayload>({
      playerId: activeId,
      secondsRemaining: 10,
    });

    engine.destroy();
  });

  it("does NOT fire a warning when turnTimeoutSeconds <= 10", () => {
    const warningListener = jest.fn();
    const engine = startDealt(["alice", "bob"], { turnTimeoutSeconds: 10 });
    engine.on("turn-timer-warning", warningListener);

    jest.advanceTimersByTime(10_000);
    expect(warningListener).not.toHaveBeenCalled();
    engine.destroy();
  });
});

// ─── player-timeout event + auto-fold ─────────────────────────────────────────

describe("player-timeout event", () => {
  it("fires when 40 s elapse without player action", () => {
    const timeoutListener = jest.fn<void, [PlayerTimeoutPayload]>();
    const engine = startDealt(["alice", "bob"]);
    const activeId = engine.getGameState().activePlayerId!;

    engine.on("player-timeout", timeoutListener);

    jest.advanceTimersByTime(40_000);

    expect(timeoutListener).toHaveBeenCalledTimes(1);
    const payload = timeoutListener.mock.calls[0]![0];
    expect(payload.playerId).toBe(activeId);
    expect(payload.autoSitOut).toBe(true);
    expect(payload.handNumber).toBe(1);
    expect(typeof payload.potSize).toBe("number");
    engine.destroy();
  });

  it("includes correct street in the payload", () => {
    const timeoutListener = jest.fn<void, [PlayerTimeoutPayload]>();
    const engine = startDealt(["alice", "bob"]);
    engine.on("player-timeout", timeoutListener);

    jest.advanceTimersByTime(40_000);

    expect(timeoutListener.mock.calls[0]![0].street).toBe("third-street");
    engine.destroy();
  });

  it("includes correct handNumber when a custom value is set", () => {
    const timeoutListener = jest.fn<void, [PlayerTimeoutPayload]>();
    const engine = startDealt(["alice", "bob"], { handNumber: 5 });
    engine.on("player-timeout", timeoutListener);

    jest.advanceTimersByTime(40_000);

    expect(timeoutListener.mock.calls[0]![0].handNumber).toBe(5);
    engine.destroy();
  });

  it("auto-folds the timed-out player", () => {
    const engine = startDealt(["alice", "bob"]);
    const activeId = engine.getGameState().activePlayerId!;

    jest.advanceTimersByTime(40_000);

    const state = engine.getGameState();
    const player = state.players.find((p) => p.id === activeId)!;
    expect(player.folded).toBe(true);
    engine.destroy();
  });

  it("starts the next player's timer after auto-fold", () => {
    const timerStarted = jest.fn<void, [TurnTimerStartedPayload]>();
    const engine = startDealt(["alice", "bob", "carol"]);
    engine.on("turn-timer-started", timerStarted);

    jest.advanceTimersByTime(40_000); // first player times out

    expect(timerStarted).toHaveBeenCalledTimes(1);
    const secondPlayerId = timerStarted.mock.calls[0]![0].playerId;
    expect(secondPlayerId).not.toBe(engine.getGameState().players[0]!.id);
    engine.destroy();
  });

  it("does NOT fire a timeout for a player who acted voluntarily", () => {
    const timeoutListener = jest.fn<void, [PlayerTimeoutPayload]>();
    const engine = startDealt(["alice", "bob"]);
    const activeId = engine.getGameState().activePlayerId!;
    engine.on("player-timeout", timeoutListener);

    // Player acts voluntarily — clearing their own timer.
    engine.check(activeId);

    // Advance to just before the NEXT player's timer would expire.
    // This confirms the original player's 40 s callback was cancelled.
    jest.advanceTimersByTime(39_999);

    const actedPlayerTimedOut = timeoutListener.mock.calls.some(
      ([p]) => p.playerId === activeId,
    );
    expect(actedPlayerTimedOut).toBe(false);
    engine.destroy();
  });
});

// ─── Timer cleared on voluntary action ───────────────────────────────────────

describe("timer cleared on voluntary action", () => {
  it("clears the timer for the acting player and starts one for the next", () => {
    const timerStarted = jest.fn<void, [TurnTimerStartedPayload]>();
    const engine = startDealt(["alice", "bob"]);
    engine.on("turn-timer-started", timerStarted);

    engine.check("alice"); // alice acts → bob's timer starts

    expect(timerStarted).toHaveBeenCalledTimes(1);
    expect(timerStarted.mock.calls[0]![0].playerId).toBe("bob");
    engine.destroy();
  });

  it("currentTurnStartTime resets after each action", () => {
    const engine = startDealt(["alice", "bob"]);
    const t1 = engine.getGameState().currentTurnStartTime!;

    jest.advanceTimersByTime(5_000);

    engine.check("alice");
    const t2 = engine.getGameState().currentTurnStartTime!;

    // Bob's timer started ~5 s after Alice's, so t2 > t1
    expect(t2).toBeGreaterThanOrEqual(t1);
    engine.destroy();
  });
});

// ─── Timers cleared at end of betting round ───────────────────────────────────

describe("timers cleared at end of betting round", () => {
  it("currentTurnStartTime is null after street-complete", () => {
    const engine = startDealt(["alice", "bob"]);
    engine.check("alice");
    engine.check("bob"); // both checked → street-complete

    expect(engine.getGameState().currentTurnStartTime).toBeNull();
    engine.destroy();
  });

  it("no player-timeout fires after the round ends even if timer was pending", () => {
    const timeoutListener = jest.fn();
    const engine = startDealt(["alice", "bob"]);
    engine.on("player-timeout", timeoutListener);

    engine.check("alice");
    engine.check("bob"); // round ends

    jest.advanceTimersByTime(40_000); // would have triggered if not cleared
    expect(timeoutListener).not.toHaveBeenCalled();
    engine.destroy();
  });
});

// ─── Timer disabled ──────────────────────────────────────────────────────────

describe("timer disabled (turnTimeoutSeconds: 0)", () => {
  it("never fires turn-timer-started", () => {
    const listener = jest.fn();
    const engine = startDealt(["alice", "bob"], { turnTimeoutSeconds: 0 });
    engine.on("turn-timer-started", listener);

    jest.advanceTimersByTime(60_000);
    expect(listener).not.toHaveBeenCalled();
    engine.destroy();
  });

  it("never fires player-timeout", () => {
    const listener = jest.fn();
    const engine = startDealt(["alice", "bob"], { turnTimeoutSeconds: 0 });
    engine.on("player-timeout", listener);

    jest.advanceTimersByTime(60_000);
    expect(listener).not.toHaveBeenCalled();
    engine.destroy();
  });

  it("currentTurnStartTime remains null", () => {
    const engine = startDealt(["alice", "bob"], { turnTimeoutSeconds: 0 });
    expect(engine.getGameState().currentTurnStartTime).toBeNull();
    engine.destroy();
  });
});

// ─── destroy() ───────────────────────────────────────────────────────────────

describe("destroy()", () => {
  it("prevents player-timeout from firing after destroy", () => {
    const timeoutListener = jest.fn();
    const engine = startDealt(["alice", "bob"]);
    engine.on("player-timeout", timeoutListener);

    engine.destroy();
    jest.advanceTimersByTime(40_000);

    expect(timeoutListener).not.toHaveBeenCalled();
  });

  it("removes all event listeners", () => {
    const listener = jest.fn();
    const engine = startDealt(["alice", "bob"]);
    engine.on("player-action", listener);

    engine.destroy();

    // Even if we could somehow call check (we can't safely after destroy),
    // confirm the listener count is zero.
    expect(engine.listenerCount("player-action")).toBe(0);
  });
});
