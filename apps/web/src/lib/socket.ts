import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@csechbox/shared-types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(username: string): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:3001", {
      auth: { username },
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
