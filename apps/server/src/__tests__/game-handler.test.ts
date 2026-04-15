/**
 * game-handler — unit tests
 *
 * Tests `setupGameEngineListeners` end-to-end with a real GameEngine (fake
 * timers) and fully mocked Socket.IO + Supabase.
 *
 * Coverage:
 *   - turn-timer-started → room broadcast
 *   - turn-timer-warning → room broadcast + personal 'your-turn-warning'
 *   - player-timeout     → isSittingOut set, room broadcast, Supabase writes
 *   - game-complete      → player-sat-out emitted, currentHandNumber bumped
 *   - auto-removal       → game-ended + room finished when only host is left
 */

// ─── Mocks (hoisted before any imports by Jest) ───────────────────────────────

jest.mock("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Supabase fluent mock ───────────────────────────────────────────────────────
//
// The game-handler chains calls like:
//   from(t).insert(data)                           → await-able
//   from(t).select(cols).eq(k,v).eq(k,v).single()  → Promise
//   from(t).update(data).eq(k,v).eq(k,v)           → await-able
//   from(t).update(data).eq(k,v)                    → await-able (endGame)
//
// We use a single "builder" object that:
//   - returns itself for every chaining method (from, select, update, eq)
//   - is a thenable (has .then) so `await builder.method()` works
//   - provides mockInsert / mockUpdate / mockSingle as named spies for
//     per-call assertions.

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockEq     = jest.fn();
const mockFrom   = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = {
  insert: mockInsert,
  update: mockUpdate,
  select: mockSelect,
  single: mockSingle,
  eq:     mockEq,
  // Make every non-terminal chain step return `db` itself.
  // This means `db.update({}).eq(k,v).eq(k,v)` still returns `db`,
  // and `await db` uses the thenable below.
  then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve({ error: null }).then(resolve, reject),
};

// Wire the mocks so all chain methods return `db` (thenable).
// `.single()` returns a real Promise so it resolves separately.
beforeAll(() => {
  mockInsert.mockReturnValue(db);
  mockUpdate.mockReturnValue(db);
  mockSelect.mockReturnValue(db);
  mockEq.mockReturnValue(db);
  mockSingle.mockResolvedValue({
    data: { timeout_count: 0, auto_sat_out_count: 0 },
    error: null,
  });
  mockFrom.mockReturnValue(db);
});

jest.mock("../lib/supabase.js", () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

// ─── Imports (after mock declarations) ───────────────────────────────────────

import { setupGameEngineListeners } from "../socket/handlers/game-handler.js";
import { GameRoomManager } from "../game/game-room-manager.js";
import { GameEngine, WinCondition } from "@poker/game-engine";
import type { GameRules } from "@poker/game-engine";

// ─── Minimal two-street game rules ───────────────────────────────────────────

const testRules: GameRules = {
  id: "test-5-card",
  name: "Test Game",
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

/**
 * Drain pending Promise microtasks.
 *
 * process.nextTick IS faked by jest.useFakeTimers(), so we must not rely on
 * it.  Promise microtasks are NOT faked; each `await Promise.resolve()` yields
 * one tick of the microtask queue.  25 iterations covers every nested await in
 * the game-handler async chains.
 */
async function flushPromises(depth = 25) {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve();
  }
}

const PLAYER_1 = "player-1";
const PLAYER_2 = "player-2";
const SOCKET_1 = "socket-1";
const SOCKET_2 = "socket-2";

function makeIo() {
  const roomEmit = jest.fn();
  const to       = jest.fn().mockReturnValue({ emit: roomEmit });
  return { io: { to } as unknown as import("socket.io").Server, to, roomEmit };
}

function buildScene(turnTimeoutSeconds = 40) {
  // @ts-expect-error — private static reset for test isolation
  GameRoomManager._instance = undefined;
  const manager = GameRoomManager.getInstance();

  const room = manager.createRoom({
    gameType: "five-card-stud",
    maxPlayers: 6,
    startingBuyIn: 1000,
    minRebuy: 500,
    maxRebuy: 2000,
    createdBy: PLAYER_1,
  });

  const ROOM_ID = room.id;

  manager.addPlayer(ROOM_ID, {
    userId: PLAYER_1, username: "Alice", chips: 1000,
    socketId: SOCKET_1, isReady: true, isHost: true,
  });
  manager.addPlayer(ROOM_ID, {
    userId: PLAYER_2, username: "Bob", chips: 1000,
    socketId: SOCKET_2, isReady: true, isHost: false,
  });

  const { io, to, roomEmit } = makeIo();

  const engine = new GameEngine(testRules, [PLAYER_1, PLAYER_2], {
    startingChips: 1000,
    turnTimeoutSeconds,
    handNumber: 1,
  });

  // Simulate what start-game does: mark room as in-progress before wiring listeners.
  manager.setStatus(ROOM_ID, "playing");
  manager.setGameEngine(ROOM_ID, engine);
  setupGameEngineListeners(ROOM_ID, engine, io, manager);

  return { manager, room, engine, io, to, roomEmit, ROOM_ID };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Re-wire db spies after clearAllMocks.
  mockInsert.mockReturnValue(db);
  mockUpdate.mockReturnValue(db);
  mockSelect.mockReturnValue(db);
  mockEq.mockReturnValue(db);
  mockSingle.mockResolvedValue({
    data: { timeout_count: 0, auto_sat_out_count: 0 },
    error: null,
  });
  mockFrom.mockReturnValue(db);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── turn-timer-started ───────────────────────────────────────────────────────

describe("turn-timer-started", () => {
  it("broadcasts to the room when dealCards() triggers the first turn", () => {
    const { engine, to, roomEmit, ROOM_ID } = buildScene();

    engine.start();
    engine.dealCards();

    expect(to).toHaveBeenCalledWith(ROOM_ID);
    expect(roomEmit).toHaveBeenCalledWith(
      "turn-timer-started",
      expect.objectContaining({
        playerId:       expect.any(String),
        timeoutSeconds: 40,
        startTime:      expect.any(Number),
      }),
    );

    engine.destroy();
  });

  it("fires again after the active player acts (next player's turn begins)", () => {
    const { engine, roomEmit } = buildScene();

    engine.start();
    engine.dealCards();

    roomEmit.mockClear();

    const activeId = engine.getGameState().activePlayerId!;
    engine.check(activeId);

    expect(roomEmit).toHaveBeenCalledWith(
      "turn-timer-started",
      expect.objectContaining({ playerId: expect.any(String) }),
    );

    engine.destroy();
  });
});

// ─── turn-timer-warning ───────────────────────────────────────────────────────

describe("turn-timer-warning", () => {
  it("broadcasts room-wide warning at 30 s (10 s remaining)", () => {
    const { engine, roomEmit } = buildScene(40);

    engine.start();
    engine.dealCards();

    const activeId = engine.getGameState().activePlayerId!;
    jest.advanceTimersByTime(30_000);

    expect(roomEmit).toHaveBeenCalledWith(
      "turn-timer-warning",
      expect.objectContaining({ playerId: activeId, secondsRemaining: 10 }),
    );

    engine.destroy();
  });

  it("emits personal 'your-turn-warning' to the active player's socket", () => {
    const { engine, to, roomEmit } = buildScene(40);

    engine.start();
    engine.dealCards();

    const activeId     = engine.getGameState().activePlayerId!;
    const activeSocket = activeId === PLAYER_1 ? SOCKET_1 : SOCKET_2;

    jest.advanceTimersByTime(30_000);

    expect(to).toHaveBeenCalledWith(activeSocket);
    expect(roomEmit).toHaveBeenCalledWith("your-turn-warning", { secondsRemaining: 10 });

    engine.destroy();
  });
});

// ─── player-timeout ───────────────────────────────────────────────────────────

describe("player-timeout", () => {
  it("marks the timed-out player isSittingOut + sitOutReason after hand ends", () => {
    // processSitOut sets isSittingOut = true synchronously (before its first
    // await), in the same JS tick as the engine's fold().
    const { engine, manager, ROOM_ID } = buildScene(40);

    engine.start();
    engine.dealCards();

    const activeId = engine.getGameState().activePlayerId!;

    jest.advanceTimersByTime(40_000);

    const player = manager.getRoom(ROOM_ID)!.players.find((p) => p.userId === activeId)!;
    expect(player.isSittingOut).toBe(true);
    expect(player.sitOutReason).toBe("timeout");

    engine.destroy();
  });

  it("broadcasts player-timed-out to the room synchronously", () => {
    const { engine, to, roomEmit, ROOM_ID } = buildScene(40);

    engine.start();
    engine.dealCards();

    const activeId = engine.getGameState().activePlayerId!;

    jest.advanceTimersByTime(40_000);

    expect(to).toHaveBeenCalledWith(ROOM_ID);
    expect(roomEmit).toHaveBeenCalledWith(
      "player-timed-out",
      expect.objectContaining({
        playerId: activeId,
        action:   "fold",
        username: expect.any(String),
      }),
    );

    engine.destroy();
  });

  it("inserts a row into timeout_history", async () => {
    const { engine, ROOM_ID } = buildScene(40);

    engine.start();
    engine.dealCards();

    jest.advanceTimersByTime(40_000);
    await flushPromises();

    expect(mockFrom).toHaveBeenCalledWith("timeout_history");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        game_id:             ROOM_ID,
        hand_number:         1,
        auto_sat_out:        true,
        chips_forfeited:     expect.any(Number),
        pot_size_at_timeout: expect.any(Number),
      }),
    );

    engine.destroy();
  });

  it("reads then writes game_sessions for timeout_count", async () => {
    const { engine } = buildScene(40);

    engine.start();
    engine.dealCards();

    jest.advanceTimersByTime(40_000);
    await flushPromises();

    const tables = mockFrom.mock.calls.map(([t]) => t);
    expect(tables).toContain("game_sessions");

    engine.destroy();
  });

  it("does NOT fire for the player who acted voluntarily before timeout", () => {
    const { engine, roomEmit } = buildScene(40);

    engine.start();
    engine.dealCards();

    const activeId = engine.getGameState().activePlayerId!;
    engine.check(activeId); // voluntary action clears the timer

    jest.advanceTimersByTime(39_999);

    const actedPlayerTimedOut = roomEmit.mock.calls.some(
      ([event, payload]) =>
        event === "player-timed-out" &&
        (payload as { playerId: string }).playerId === activeId,
    );
    expect(actedPlayerTimedOut).toBe(false);

    engine.destroy();
  });
});

// ─── game-complete → sit-out processing ──────────────────────────────────────

describe("game-complete — sit-out processing", () => {
  it("emits player-sat-out for the timed-out player", async () => {
    // 2-player game: timing out player A auto-ends the hand (only B remains).
    // game-complete fires in the same sync tick; processSitOut runs and
    // player-sat-out is emitted once the async chain resolves.
    const { engine, roomEmit } = buildScene(40);

    engine.start();
    engine.dealCards();

    const activeId = engine.getGameState().activePlayerId!;

    jest.advanceTimersByTime(40_000);
    await flushPromises();

    expect(roomEmit).toHaveBeenCalledWith(
      "player-sat-out",
      expect.objectContaining({
        playerId:  activeId,
        automatic: true,
        reason:    "timeout",
      }),
    );
  });

  it("increments currentHandNumber after the hand ends", async () => {
    const { engine, manager, ROOM_ID } = buildScene(40);

    engine.start();
    engine.dealCards();

    jest.advanceTimersByTime(40_000);
    await flushPromises();

    expect(manager.getRoom(ROOM_ID)!.currentHandNumber).toBe(1);
  });
});

// ─── auto-removal: only host remains ─────────────────────────────────────────
//
// For auto-removal to trigger, the NON-HOST must be the one who times out.
// If the host (PLAYER_1) happens to be the first active player, we let them
// check voluntarily so it becomes the non-host's (PLAYER_2's) turn, then
// advance the timer 40 s to trigger the non-host timeout.

function advanceToNonHostTimeout(engine: ReturnType<typeof buildScene>["engine"]) {
  engine.start();
  engine.dealCards();

  // If the host is first active, let them act so the non-host is next.
  if (engine.getGameState().activePlayerId === PLAYER_1) {
    engine.check(PLAYER_1);
  }

  // Now the non-host (PLAYER_2) is active; advance their 40 s timeout.
  jest.advanceTimersByTime(40_000);
}

describe("auto-removal when only host remains", () => {
  it("emits game-ended when only the host is left", async () => {
    const { engine, roomEmit } = buildScene(40);

    advanceToNonHostTimeout(engine);
    await flushPromises();

    expect(roomEmit).toHaveBeenCalledWith(
      "game-ended",
      expect.objectContaining({ autoEnded: true }),
    );
  });

  it("marks the room status as finished", async () => {
    const { engine, manager, ROOM_ID } = buildScene(40);

    advanceToNonHostTimeout(engine);
    await flushPromises();

    expect(manager.getRoom(ROOM_ID)?.status).toBe("finished");
  });
});
