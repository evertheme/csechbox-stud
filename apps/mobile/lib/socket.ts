/**
 * Legacy socket helpers — thin wrappers around the new SocketService.
 *
 * Existing call-sites that import `getSocket`, `connectSocket`, or
 * `disconnectSocket` keep working unchanged.  Prefer importing
 * `socketService` from `./socket-service` directly in new code.
 */

import { io, type Socket } from "socket.io-client";
import { socketService } from "./socket-service";

// ─── Legacy raw-socket access ─────────────────────────────────────────────────
//
// Some screens (e.g. GamePlayScreen) import `getSocket()` to attach
// listeners directly.  We still expose a raw Socket reference for them,
// but the connection lifecycle is now owned by SocketService.

const SOCKET_URL =
  process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3001";

let _legacySocket: Socket | null = null;

/** Return the legacy raw Socket singleton. Creates it lazily if needed. */
export function getSocket(): Socket {
  if (!_legacySocket) {
    _legacySocket = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: false,
    });
  }
  return _legacySocket;
}

/**
 * Connect (if not already connected) with an optional bearer token.
 * @deprecated Use `socketService.connect(token)` instead.
 */
export function connectSocket(token?: string | null): Socket {
  const socket = getSocket();
  if (!socket.connected) {
    if (token) socket.auth = { token };
    socket.connect();
  }
  return socket;
}

/**
 * Disconnect and destroy the legacy singleton.
 * Also disconnects the SocketService so the two stay in sync.
 * @deprecated Use `socketService.disconnect()` instead.
 */
export function disconnectSocket(): void {
  if (_legacySocket) {
    _legacySocket.disconnect();
    _legacySocket = null;
  }
  socketService.disconnect();
}

export { socketService };
