import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@csechbox/shared-types";

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerGameHandlers(io: IoServer, socket: IoSocket) {
  socket.on("game:action", (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      socket.emit("error", "Not in a room");
      return;
    }
    io.to(roomId).emit("game:action", socket.data.playerId, payload);
  });

  socket.on("player:ready", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    console.log(`[game] Player ${socket.data.playerId} ready in room ${roomId}`);
  });
}
