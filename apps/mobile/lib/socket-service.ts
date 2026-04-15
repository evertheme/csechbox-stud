/**
 * Centralized Socket.io client service.
 *
 * Architecture
 * ────────────
 * • Singleton class — one connection shared across the entire app lifetime.
 * • Wraps the raw socket.io `Socket` so callers never import socket.io-client
 *   directly; they interact only through typed methods on `socketService`.
 * • Maps the user-facing method names (createRoom, joinRoom, playerAction …)
 *   to the actual wire-event names used by the server
 *   ('room:create', 'room:join', 'game:action' …).
 * • Provides exponential-backoff reconnection, auth-token injection, connection-
 *   state callbacks, and a debug logger.
 *
 * Usage
 * ─────
 *   // Connect once (e.g. after sign-in)
 *   await socketService.connect(session.access_token);
 *
 *   // Subscribe to game events
 *   socketService.on('game:state', (state) => setGameState(state));
 *
 *   // Emit actions
 *   await socketService.joinRoom('room-abc');
 *
 *   // Disconnect on sign-out
 *   socketService.disconnect();
 */

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ShowdownResult,
} from "@poker/shared-types";
import type {
  BettingActionPayload,
  Card,
  GamePhase,
} from "@poker/shared-types";
import type { PlayerPublic } from "@poker/shared-types";
import type { GameState, GameRoom } from "@poker/shared-types";

// ─── Re-export shared types consumers care about ──────────────────────────────

export type {
  GameState,
  GameRoom,
  GameSettings,
} from "@poker/shared-types";
export type { BettingActionPayload, Card, GamePhase } from "@poker/shared-types";
export type { PlayerPublic, PlayerStatus } from "@poker/shared-types";
export type { ShowdownResult } from "@poker/shared-types";

// ─── Service-local types ──────────────────────────────────────────────────────

export interface CreateRoomConfig {
  name: string;
}

export interface RoomCreatedResponse {
  room: GameRoom;
}

export interface RoomJoinedResponse {
  state: GameState | null;
}

/** Union of all events the service emits to listeners via `on()`. */
export interface SocketEvents {
  // Connection
  "connect": () => void;
  "disconnect": (reason: string) => void;
  // Room
  "room:list": (rooms: GameRoom[]) => void;
  "game:player-joined": (player: PlayerPublic) => void;
  "game:player-left": (playerId: string) => void;
  // Game lifecycle
  "game:state": (state: GameState) => void;
  "game:phase-change": (phase: GamePhase) => void;
  "game:deal-hole-cards": (cards: Card[]) => void;
  "game:showdown": (results: ShowdownResult[]) => void;
  "game:action": (playerId: string, payload: BettingActionPayload) => void;
  // Errors
  "error": (message: string) => void;
  // Chat (not yet in shared-types; handled as a raw string event)
  "chat-message": (payload: ChatMessage) => void;
}

export interface ChatMessage {
  playerId: string;
  username: string;
  message: string;
  timestamp: number;
}

export type SocketEventName = keyof SocketEvents;
export type SocketEventCallback<E extends SocketEventName> = SocketEvents[E];

// Internal typed socket alias.
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ─── Logger ───────────────────────────────────────────────────────────────────

const IS_DEV = process.env["NODE_ENV"] !== "production";

function log(level: "info" | "warn" | "error", ...args: unknown[]): void {
  if (!IS_DEV) return;
  const prefix = "[SocketService]";
  if (level === "error") console.error(prefix, ...args);
  else if (level === "warn") console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}

// ─── SocketService ────────────────────────────────────────────────────────────

class SocketService {
  private socket: TypedSocket | null = null;

  /**
   * Map from event name → array of listener callbacks.
   * Allows multiple subscribers per event (mirrors EventEmitter semantics).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  /** Callbacks notified on every connect/disconnect toggle. */
  private connectionCallbacks: Array<(connected: boolean) => void> = [];

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelayMs = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _token: string | null = null;

  // ── Connection ─────────────────────────────────────────────────────────────

  /**
   * Establish the socket connection authenticated with a Supabase JWT.
   * Resolves when the `connect` event fires or rejects after a timeout.
   */
  connect(token: string): Promise<void> {
    this._token = token;

    if (this.socket?.connected) {
      log("info", "Already connected — skipping connect()");
      return Promise.resolve();
    }

    // Tear down any stale socket before recreating.
    this._destroySocket();

    const url = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3001";

    this.socket = io(url, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false, // We handle reconnection ourselves for full control.
      auth: { token },
    }) as TypedSocket;

    this._attachInternalHandlers();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Socket connection timed out"));
      }, 10_000);

      this.socket!.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket!.once("connect_error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      log("info", "Connecting…");
      this.socket!.connect();
    });
  }

  /** Cleanly disconnect and clear all state. */
  disconnect(): void {
    log("info", "Disconnecting…");
    this._clearReconnectTimer();
    // Notify before destroying so listeners still exist when we emit false.
    if (this.socket?.connected) {
      this._notifyConnection(false);
    }
    this._destroySocket();
    this.reconnectAttempts = 0;
    this._token = null;
  }

  // ── Internal socket wiring ─────────────────────────────────────────────────

  private _attachInternalHandlers(): void {
    const socket = this.socket!;

    socket.on("connect", () => {
      log("info", `Connected  id=${socket.id}`);
      this.reconnectAttempts = 0;
      this._clearReconnectTimer();
      this._notifyConnection(true);
      this._forwardToListeners("connect");
    });

    socket.on("disconnect", (reason) => {
      log("warn", `Disconnected  reason=${reason}`);
      this._notifyConnection(false);
      this._forwardToListeners("disconnect", reason);

      // Attempt reconnection unless the client initiated the disconnect.
      if (reason !== "io client disconnect") {
        this._scheduleReconnect();
      }
    });

    socket.on("connect_error", (err) => {
      log("error", "Connection error:", err.message);
      this._scheduleReconnect();
    });

    // Forward every ServerToClient event to local listeners.
    const forward = <E extends keyof ServerToClientEvents>(event: E) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(event as string, (...args: any[]) => {
        this._forwardToListeners(event as string, ...args);
      });
    };

    forward("game:state");
    forward("game:phase-change");
    forward("game:player-joined");
    forward("game:player-left");
    forward("game:action");
    forward("game:deal-hole-cards");
    forward("game:showdown");
    forward("room:list");
    forward("error");

    // Chat is not yet in shared-types — listen as a raw string event.
    socket.on("chat-message" as string, (...args: unknown[]) => {
      this._forwardToListeners("chat-message", ...args);
    });
  }

  private _destroySocket(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  // ── Exponential-backoff reconnection ───────────────────────────────────────

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log("error", `Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts),
      30_000 // cap at 30 seconds
    );

    this.reconnectAttempts++;
    log("info", `Reconnect attempt ${this.reconnectAttempts} in ${delay}ms…`);

    this._clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (!this._token) return;
      this.connect(this._token).catch((err: unknown) => {
        log("error", "Reconnect failed:", err);
      });
    }, delay);
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Event system ───────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _forwardToListeners(event: string, ...args: any[]): void {
    const cbs = this.listeners.get(event);
    if (!cbs?.length) return;
    for (const cb of [...cbs]) {
      try {
        cb(...args);
      } catch (err) {
        log("error", `Listener for "${event}" threw:`, err);
      }
    }
  }

  private _notifyConnection(connected: boolean): void {
    for (const cb of this.connectionCallbacks) {
      try {
        cb(connected);
      } catch {}
    }
  }

  /**
   * Subscribe to a socket event.  Safe to call before `connect()`.
   */
  on<E extends SocketEventName>(
    event: E,
    callback: SocketEventCallback<E>
  ): void {
    const list = this.listeners.get(event) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list.push(callback as (...args: any[]) => void);
    this.listeners.set(event, list);
  }

  /**
   * Unsubscribe a previously-registered listener.
   */
  off<E extends SocketEventName>(
    event: E,
    callback: SocketEventCallback<E>
  ): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(callback as (...args: unknown[]) => void);
    if (idx !== -1) list.splice(idx, 1);
  }

  /** Remove ALL listeners for an event. */
  offAll(event: SocketEventName): void {
    this.listeners.delete(event);
  }

  /**
   * Generic low-level emit — prefer the typed helper methods below.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, data?: any): void {
    if (!this.socket?.connected) {
      log("warn", `emit("${event}") — not connected, dropping`);
      return;
    }
    this.socket.emit(event as keyof ClientToServerEvents, data);
  }

  // ── Connection status ─────────────────────────────────────────────────────

  isConnected(): boolean {
    return this.socket?.connected === true;
  }

  /**
   * Register a callback that fires every time the connection state flips.
   * Returns an unsubscribe function.
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      const idx = this.connectionCallbacks.indexOf(callback);
      if (idx !== -1) this.connectionCallbacks.splice(idx, 1);
    };
  }

  // ── Room management ────────────────────────────────────────────────────────

  /**
   * Create a new game room.
   * Resolves with the created `GameRoom` or rejects on server error.
   */
  createRoom(config: CreateRoomConfig): Promise<RoomCreatedResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error("Not connected"));
      }
      this.socket.emit("room:create", config.name, (room: GameRoom) => {
        resolve({ room });
      });
      // Reject if the server emits an error before callback fires.
      this.socket.once("error", reject);
    });
  }

  /**
   * Join an existing room.
   * Resolves with the current `GameState` (or null for a waiting room).
   */
  joinRoom(roomId: string): Promise<RoomJoinedResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error("Not connected"));
      }
      this.socket.emit(
        "room:join",
        roomId,
        (state: GameState | null) => {
          resolve({ state });
        }
      );
      this.socket.once("error", reject);
    });
  }

  /** Leave the current room. */
  leaveRoom(roomId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit("room:leave", roomId);
  }

  // ── Game actions ───────────────────────────────────────────────────────────

  /** Emit a betting action (fold, check, call, raise, all-in). */
  playerAction(action: BettingActionPayload): void {
    if (!this.socket?.connected) {
      log("warn", "playerAction — not connected");
      return;
    }
    this.socket.emit("game:action", action);
  }

  /** Toggle this player's ready state in the waiting room. */
  toggleReady(): void {
    if (!this.socket?.connected) return;
    this.socket.emit("player:ready");
  }

  /** Start the game (host only). */
  startGame(): void {
    if (!this.socket?.connected) return;
    this.socket.emit("game:start");
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  /** Send a chat message to everyone in the current room. */
  sendChatMessage(message: string): void {
    if (!this.socket?.connected) return;
    // 'chat-message' is not yet typed in shared-types; emit as raw string.
    this.socket.emit("chat-message" as keyof ClientToServerEvents, {
      message,
      timestamp: Date.now(),
    } as unknown as never);
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  /** Return a snapshot of current service state (useful for debugging). */
  getStatus(): {
    connected: boolean;
    socketId: string | null;
    reconnectAttempts: number;
    listenerCount: number;
  } {
    return {
      connected: this.isConnected(),
      socketId: this.socket?.id ?? null,
      reconnectAttempts: this.reconnectAttempts,
      listenerCount: Array.from(this.listeners.values()).reduce(
        (acc, cbs) => acc + cbs.length,
        0
      ),
    };
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/**
 * The global SocketService singleton.
 *
 * Import this wherever you need socket functionality:
 *
 *   import { socketService } from '@/lib/socket-service';
 */
export const socketService = new SocketService();
