/**
 * Tests for SocketService (lib/socket-service.ts)
 *
 * Strategy
 * ────────
 * We mock socket.io-client so no real network connection is made.
 * The mock returns an EventEmitter-like object (`mockSocketInstance`) whose
 * `.emit()` and `.on()` can be inspected and driven from the test.
 *
 * The SocketService singleton is re-imported fresh for every describe block
 * that needs a clean state by clearing the module registry between tests.
 */

import { type Socket } from "socket.io-client";

// ─── socket.io-client mock ────────────────────────────────────────────────────

type Listener = (...args: unknown[]) => void;

interface MockSocket {
  id: string;
  connected: boolean;
  auth: Record<string, unknown>;
  on: jest.Mock;
  once: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  removeAllListeners: jest.Mock;
  // Internal helpers for tests to drive events.
  _trigger: (event: string, ...args: unknown[]) => void;
  _listeners: Map<string, Listener[]>;
}

function createMockSocket(): MockSocket {
  const listeners = new Map<string, Listener[]>();
  const onceListeners = new Map<string, Listener[]>();

  const trigger = (event: string, ...args: unknown[]) => {
    for (const cb of listeners.get(event) ?? []) cb(...args);
    const once = onceListeners.get(event) ?? [];
    onceListeners.delete(event);
    for (const cb of once) cb(...args);
  };

  return {
    id: "mock-socket-id",
    connected: false,
    auth: {},
    _listeners: listeners,
    _trigger: trigger,

    on: jest.fn((event: string, cb: Listener) => {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
    }),

    once: jest.fn((event: string, cb: Listener) => {
      const list = onceListeners.get(event) ?? [];
      list.push(cb);
      onceListeners.set(event, list);
    }),

    off: jest.fn((event: string, cb: Listener) => {
      const list = listeners.get(event) ?? [];
      listeners.set(event, list.filter((l) => l !== cb));
    }),

    emit: jest.fn(),

    connect: jest.fn(function (this: MockSocket) {
      this.connected = true;
      // Simulate async connect success on next tick.
      setTimeout(() => trigger("connect"), 0);
    }),

    disconnect: jest.fn(function (this: MockSocket) {
      this.connected = false;
      trigger("disconnect", "io client disconnect");
    }),

    removeAllListeners: jest.fn(() => {
      listeners.clear();
      onceListeners.clear();
    }),
  };
}

let mockSocketInstance: MockSocket;

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => mockSocketInstance),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function importFreshService() {
  jest.resetModules();
  // Re-create the mock socket each time so state doesn't bleed between tests.
  mockSocketInstance = createMockSocket();
  // Re-require io mock to point to latest instance.
  const { io } = require("socket.io-client") as { io: jest.Mock };
  io.mockReturnValue(mockSocketInstance);

  const { socketService } = require("../../lib/socket-service") as typeof import("../../lib/socket-service");
  return socketService;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SocketService.connect()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a socket with the correct URL and auth token", async () => {
    const service = importFreshService();
    const { io } = require("socket.io-client") as { io: jest.Mock };

    const connectPromise = service.connect("my-jwt");
    jest.runAllTimers(); // flush setTimeout in mock `connect`
    await connectPromise;

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: { token: "my-jwt" } })
    );
  });

  it("resolves when the connect event fires", async () => {
    const service = importFreshService();

    const connectPromise = service.connect("token-abc");
    jest.runAllTimers();
    await expect(connectPromise).resolves.toBeUndefined();
  });

  it("returns immediately if already connected", async () => {
    const service = importFreshService();

    const p1 = service.connect("t1");
    jest.runAllTimers();
    await p1;

    // Second call should not call socket.connect() again.
    const callsBefore = mockSocketInstance.connect.mock.calls.length;
    const p2 = service.connect("t2");
    jest.runAllTimers();
    await p2;

    expect(mockSocketInstance.connect.mock.calls.length).toBe(callsBefore);
  });

  it("rejects if connect_error fires", async () => {
    const service = importFreshService();
    const { io } = require("socket.io-client") as { io: jest.Mock };

    // Override connect to fire connect_error instead.
    mockSocketInstance.connect.mockImplementationOnce(function (this: MockSocket) {
      setTimeout(() => mockSocketInstance._trigger("connect_error", new Error("refused")), 0);
    });
    io.mockReturnValue(mockSocketInstance);

    const connectPromise = service.connect("bad-token");
    jest.runAllTimers();
    await expect(connectPromise).rejects.toThrow("refused");
  });
});

describe("SocketService.disconnect()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls socket.disconnect()", async () => {
    const service = importFreshService();

    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.disconnect();
    expect(mockSocketInstance.disconnect).toHaveBeenCalled();
  });

  it("reports isConnected() === false after disconnect", async () => {
    const service = importFreshService();

    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.disconnect();
    // mockSocket.disconnect sets connected = false and triggers 'disconnect'
    expect(service.isConnected()).toBe(false);
  });
});

describe("SocketService.isConnected()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns false before connecting", () => {
    const service = importFreshService();
    expect(service.isConnected()).toBe(false);
  });

  it("returns true after a successful connect", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;
    expect(service.isConnected()).toBe(true);
  });
});

describe("SocketService.on() / off()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("delivers a forwarded server event to a listener", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    const handler = jest.fn();
    service.on("error", handler);

    // Simulate the server emitting 'error'.
    mockSocketInstance._trigger("error", "something went wrong");

    expect(handler).toHaveBeenCalledWith("something went wrong");
  });

  it("stops delivering events after off() is called", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    const handler = jest.fn();
    service.on("error", handler);
    service.off("error", handler);

    mockSocketInstance._trigger("error", "oops");
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple listeners for the same event", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    const h1 = jest.fn();
    const h2 = jest.fn();
    service.on("error", h1);
    service.on("error", h2);

    mockSocketInstance._trigger("error", "boom");
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it("can register listeners before connect() is called", async () => {
    const service = importFreshService();

    const handler = jest.fn();
    service.on("room:list", handler);

    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    mockSocketInstance._trigger("room:list", []);
    expect(handler).toHaveBeenCalledWith([]);
  });

  it("offAll() removes every listener for an event", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    const h = jest.fn();
    service.on("error", h);
    service.offAll("error");

    mockSocketInstance._trigger("error", "ignored");
    expect(h).not.toHaveBeenCalled();
  });
});

describe("SocketService.onConnectionChange()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires with true on connect and false on disconnect", async () => {
    const service = importFreshService();
    const cb = jest.fn();
    service.onConnectionChange(cb);

    const p = service.connect("tok");
    jest.runAllTimers();
    await p;
    expect(cb).toHaveBeenLastCalledWith(true);

    service.disconnect();
    expect(cb).toHaveBeenLastCalledWith(false);
  });

  it("returned unsubscribe function stops the callback", async () => {
    const service = importFreshService();
    const cb = jest.fn();
    const unsub = service.onConnectionChange(cb);
    unsub();

    const p = service.connect("tok");
    jest.runAllTimers();
    await p;
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("SocketService.createRoom()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits room:create with the room name and resolves the response", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    const fakeRoom = { id: "r1", name: "My Room", playerCount: 0, maxPlayers: 6, isStarted: false, settings: {} as never, createdAt: 0 };

    // Capture the callback argument and invoke it.
    mockSocketInstance.emit.mockImplementationOnce(
      (_event: string, _name: string, callback: (room: typeof fakeRoom) => void) => {
        callback(fakeRoom);
      }
    );

    const result = await service.createRoom({ name: "My Room" });

    expect(mockSocketInstance.emit).toHaveBeenCalledWith(
      "room:create",
      "My Room",
      expect.any(Function)
    );
    expect(result.room).toEqual(fakeRoom);
  });

  it("rejects if not connected", async () => {
    const service = importFreshService();
    await expect(service.createRoom({ name: "x" })).rejects.toThrow("Not connected");
  });
});

describe("SocketService.joinRoom()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits room:join with the roomId and resolves state", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    mockSocketInstance.emit.mockImplementationOnce(
      (_event: string, _roomId: string, callback: (state: null) => void) => {
        callback(null);
      }
    );

    const result = await service.joinRoom("room-123");

    expect(mockSocketInstance.emit).toHaveBeenCalledWith(
      "room:join",
      "room-123",
      expect.any(Function)
    );
    expect(result).toEqual({ state: null });
  });

  it("rejects if not connected", async () => {
    const service = importFreshService();
    await expect(service.joinRoom("x")).rejects.toThrow("Not connected");
  });
});

describe("SocketService.leaveRoom()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits room:leave with the roomId", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.leaveRoom("room-abc");

    expect(mockSocketInstance.emit).toHaveBeenCalledWith("room:leave", "room-abc");
  });

  it("is a no-op when not connected", () => {
    const service = importFreshService();
    expect(() => service.leaveRoom("x")).not.toThrow();
    expect(mockSocketInstance.emit).not.toHaveBeenCalled();
  });
});

describe("SocketService.playerAction()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits game:action with the payload", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.playerAction({ action: "raise", amount: 100 });

    expect(mockSocketInstance.emit).toHaveBeenCalledWith("game:action", {
      action: "raise",
      amount: 100,
    });
  });

  it("is a no-op when not connected", () => {
    const service = importFreshService();
    expect(() => service.playerAction({ action: "fold" })).not.toThrow();
    expect(mockSocketInstance.emit).not.toHaveBeenCalled();
  });
});

describe("SocketService.toggleReady()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits player:ready", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.toggleReady();
    expect(mockSocketInstance.emit).toHaveBeenCalledWith("player:ready");
  });
});

describe("SocketService.startGame()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits game:start", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.startGame();
    expect(mockSocketInstance.emit).toHaveBeenCalledWith("game:start");
  });
});

describe("SocketService.sendChatMessage()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits chat-message with the text and a timestamp", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.sendChatMessage("hello world");

    expect(mockSocketInstance.emit).toHaveBeenCalledWith(
      "chat-message",
      expect.objectContaining({ message: "hello world", timestamp: expect.any(Number) })
    );
  });
});

describe("SocketService.getStatus()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports disconnected state before connect", () => {
    const service = importFreshService();
    const status = service.getStatus();
    expect(status.connected).toBe(false);
    expect(status.socketId).toBeNull();
    expect(status.reconnectAttempts).toBe(0);
  });

  it("reports connected state and listenerCount after connect", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    service.on("error", jest.fn());
    service.on("error", jest.fn());

    const status = service.getStatus();
    expect(status.connected).toBe(true);
    expect(status.listenerCount).toBeGreaterThanOrEqual(2);
  });
});

describe("SocketService — reconnection backoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("schedules a reconnect when an unexpected disconnect occurs", async () => {
    const service = importFreshService();
    const p = service.connect("tok");
    jest.runAllTimers();
    await p;

    // Intercept the reconnect attempt without actually re-connecting.
    const connectSpy = jest.spyOn(service, "connect").mockResolvedValue(undefined);

    // Simulate a server-initiated disconnect (not a client-initiated one).
    // The internal handler fires because the mock socket registered a real
    // socket.on("disconnect", ...) when _attachInternalHandlers() ran.
    mockSocketInstance.connected = false;
    mockSocketInstance._trigger("disconnect", "transport close");

    // Advance past the first backoff delay (base 1000ms × 2^0 = 1000ms).
    jest.advanceTimersByTime(1100);

    expect(connectSpy).toHaveBeenCalled();
  });
});

describe("SocketService — forwarded server events", () => {
  const serverEvents = [
    "game:state",
    "game:phase-change",
    "game:player-joined",
    "game:player-left",
    "game:action",
    "game:deal-hole-cards",
    "game:showdown",
    "room:list",
    "error",
    "chat-message",
  ] as const;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  for (const event of serverEvents) {
    it(`forwards "${event}" to registered listeners`, async () => {
      const service = importFreshService();
      const p = service.connect("tok");
      jest.runAllTimers();
      await p;

      const handler = jest.fn();
      // on() is typed — use a cast for this generic loop.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).on(event, handler);

      const payload = { example: true };
      mockSocketInstance._trigger(event, payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });
  }
});
