/**
 * Socket.io client singleton.
 *
 * A single Socket instance is shared for the entire app lifetime.
 * Individual screens attach / detach listeners as needed but should NOT call
 * disconnectSocket() unless the user signs out.
 */

import { io, type Socket } from "socket.io-client";

const SOCKET_URL =
  process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3001";

let _socket: Socket | null = null;

/** Return the singleton Socket, creating it lazily if necessary. */
export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: false,
    });
  }
  return _socket;
}

/**
 * Connect (if not already connected) and optionally attach a bearer token
 * for server-side authentication.
 */
export function connectSocket(token?: string | null): Socket {
  const socket = getSocket();
  if (!socket.connected) {
    if (token) {
      socket.auth = { token };
    }
    socket.connect();
  }
  return socket;
}

/**
 * Disconnect and destroy the singleton so the next call to getSocket() creates
 * a fresh connection.  Call this on sign-out.
 */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
