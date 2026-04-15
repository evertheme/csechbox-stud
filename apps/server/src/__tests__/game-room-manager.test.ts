/**
 * GameRoomManager — unit tests
 *
 * Covers all the additions made in the timeout-handling phase:
 *   - New WaitingPlayer runtime state fields (totalBuyIn, pendingSitOut, …)
 *   - WaitingRoom.currentHandNumber initialisation
 *   - GameEngine storage (setGameEngine / getGameEngine / removeGameEngine)
 *   - incrementHandNumber
 *   - deleteRoom cleans up the stored engine
 */

import { GameRoomManager } from "../game/game-room-manager.js";
import type { AddPlayerArgs, WaitingPlayer } from "../game/game-room-manager.js";

// ─── Minimal fake engine ──────────────────────────────────────────────────────

function makeFakeEngine() {
  return { destroy: jest.fn() } as unknown as import("@poker/game-engine").GameEngine;
}

// ─── Test-state reset ─────────────────────────────────────────────────────────

let manager: GameRoomManager;

beforeEach(() => {
  // Force a fresh singleton for every test.
  // @ts-expect-error — accessing private static for test isolation
  GameRoomManager._instance = undefined;
  manager = GameRoomManager.getInstance();
});

// ─── Helper: create a room with one player ────────────────────────────────────

function makeRoom() {
  const room = manager.createRoom({
    gameType: "five-card-stud",
    maxPlayers: 6,
    startingBuyIn: 1000,
    minRebuy: 500,
    maxRebuy: 2000,
    createdBy: "host-id",
  });
  return room;
}

const basePlayer: AddPlayerArgs = {
  userId: "player-1",
  username: "Alice",
  chips: 1000,
  socketId: "socket-1",
  isReady: false,
  isHost: true,
};

// ─── createRoom ───────────────────────────────────────────────────────────────

describe("createRoom", () => {
  it("initialises currentHandNumber to 0", () => {
    const room = makeRoom();
    expect(room.currentHandNumber).toBe(0);
  });

  it("stores the room and returns it via getRoom", () => {
    const room = makeRoom();
    expect(manager.getRoom(room.id)).toBe(room);
  });
});

// ─── addPlayer — runtime state defaults ──────────────────────────────────────

describe("addPlayer — runtime state defaults", () => {
  it("defaults totalBuyIn to the player chips amount", () => {
    const room = makeRoom();
    const player = manager.addPlayer(room.id, basePlayer)!;
    expect(player.totalBuyIn).toBe(1000);
  });

  it("defaults pendingSitOut to false", () => {
    const room = makeRoom();
    const player = manager.addPlayer(room.id, basePlayer)!;
    expect(player.pendingSitOut).toBe(false);
  });

  it("defaults isSittingOut to false", () => {
    const room = makeRoom();
    const player = manager.addPlayer(room.id, basePlayer)!;
    expect(player.isSittingOut).toBe(false);
  });

  it("respects explicit totalBuyIn if provided", () => {
    const room = makeRoom();
    const player = manager.addPlayer(room.id, {
      ...basePlayer,
      totalBuyIn: 1500,
    })!;
    expect(player.totalBuyIn).toBe(1500);
  });

  it("respects explicit pendingSitOut if provided", () => {
    const room = makeRoom();
    const player = manager.addPlayer(room.id, {
      ...basePlayer,
      pendingSitOut: true,
    })!;
    expect(player.pendingSitOut).toBe(true);
  });
});

// ─── incrementHandNumber ──────────────────────────────────────────────────────

describe("incrementHandNumber", () => {
  it("increments from 0 to 1 on first call", () => {
    const room = makeRoom();
    expect(manager.incrementHandNumber(room.id)).toBe(1);
    expect(room.currentHandNumber).toBe(1);
  });

  it("increments sequentially on repeated calls", () => {
    const room = makeRoom();
    manager.incrementHandNumber(room.id);
    manager.incrementHandNumber(room.id);
    const result = manager.incrementHandNumber(room.id);
    expect(result).toBe(3);
    expect(room.currentHandNumber).toBe(3);
  });

  it("returns 0 for an unknown room id", () => {
    expect(manager.incrementHandNumber("non-existent")).toBe(0);
  });
});

// ─── GameEngine storage ───────────────────────────────────────────────────────

describe("GameEngine storage", () => {
  it("setGameEngine stores the engine and getGameEngine retrieves it", () => {
    const room = makeRoom();
    const engine = makeFakeEngine();

    manager.setGameEngine(room.id, engine);

    expect(manager.getGameEngine(room.id)).toBe(engine);
  });

  it("getGameEngine returns undefined for an unknown roomId", () => {
    expect(manager.getGameEngine("unknown")).toBeUndefined();
  });

  it("removeGameEngine calls engine.destroy()", () => {
    const room = makeRoom();
    const engine = makeFakeEngine();

    manager.setGameEngine(room.id, engine);
    manager.removeGameEngine(room.id);

    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getGameEngine(room.id)).toBeUndefined();
  });

  it("removeGameEngine is a no-op when no engine is stored", () => {
    const room = makeRoom();
    // Should not throw.
    expect(() => manager.removeGameEngine(room.id)).not.toThrow();
  });

  it("overwriting an engine with setGameEngine does NOT destroy the old one", () => {
    const room = makeRoom();
    const engine1 = makeFakeEngine();
    const engine2 = makeFakeEngine();

    manager.setGameEngine(room.id, engine1);
    manager.setGameEngine(room.id, engine2);

    expect(engine1.destroy).not.toHaveBeenCalled();
    expect(manager.getGameEngine(room.id)).toBe(engine2);
  });
});

// ─── deleteRoom — engine cleanup ─────────────────────────────────────────────

describe("deleteRoom", () => {
  it("destroys the engine when a room is deleted", () => {
    const room = makeRoom();
    const engine = makeFakeEngine();

    manager.setGameEngine(room.id, engine);
    manager.deleteRoom(room.id);

    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getRoom(room.id)).toBeUndefined();
    expect(manager.getGameEngine(room.id)).toBeUndefined();
  });

  it("is safe to delete a room that has no engine", () => {
    const room = makeRoom();
    expect(() => manager.deleteRoom(room.id)).not.toThrow();
  });
});

// ─── setStatus ────────────────────────────────────────────────────────────────

describe("setStatus", () => {
  it("transitions room status from waiting to playing", () => {
    const room = makeRoom();
    manager.setStatus(room.id, "playing");
    expect(room.status).toBe("playing");
  });

  it("transitions room status to finished", () => {
    const room = makeRoom();
    manager.setStatus(room.id, "playing");
    manager.setStatus(room.id, "finished");
    expect(room.status).toBe("finished");
  });
});

// ─── Mutating player runtime state directly ───────────────────────────────────

describe("WaitingPlayer runtime state mutation", () => {
  it("player object is mutated by reference so changes are visible via getRoom", () => {
    const room = makeRoom();
    const player = manager.addPlayer(room.id, basePlayer) as WaitingPlayer;

    player.pendingSitOut = true;
    player.sitOutReason = "timeout";

    const fromRoom = manager.getRoom(room.id)!.players[0]!;
    expect(fromRoom.pendingSitOut).toBe(true);
    expect(fromRoom.sitOutReason).toBe("timeout");
  });
});
