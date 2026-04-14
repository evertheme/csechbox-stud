import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@poker/shared-types";
import { registerRoomHandlers } from "./handlers/room-handlers.js";
import { registerGameHandlers } from "./handlers/game-handlers.js";
import { logger } from "../lib/logger.js";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: process.env["CLIENT_ORIGIN"] ?? "*",
        methods: ["GET", "POST"],
      },
    },
  );

  io.on("connection", (socket) => {
    const username = (socket.handshake.auth as Record<string, string>)["username"] ?? "Anonymous";
    socket.data.playerId = socket.id;
    socket.data.username = username;

    logger.info(`🔌  Socket connected     ${socket.id}  (${username})`);

    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      logger.info(`🔌  Socket disconnected  ${socket.id}  (${reason})`);
    });
  });

  return io;
}
