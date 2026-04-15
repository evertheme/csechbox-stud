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
import { registerWaitingRoomHandlers } from "./handlers/room-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ─── JWT authentication middleware ────────────────────────────────────────────
//
// The mobile client sends the Supabase JWT in `socket.handshake.auth.token`.
// We validate it against the Supabase service-role client and populate
// `socket.data.user` so handlers can trust that field.
//
// Connections without a token (or when Supabase is not configured) are allowed
// through with `user = null` so the legacy lobby flow keeps working.

async function attachAuthUser(
  socket: Parameters<Parameters<IoServer["use"]>[0]>[0],
  next: Parameters<Parameters<IoServer["use"]>[0]>[1],
): Promise<void> {
  const token = (socket.handshake.auth as Record<string, unknown>)["token"];

  if (typeof token !== "string" || !token) {
    socket.data.user = null;
    return next();
  }

  const supabase = getSupabase();
  if (!supabase) {
    socket.data.user = null;
    return next();
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      socket.data.user = null;
      return next();
    }

    const meta = data.user.user_metadata as Record<string, unknown> | undefined;
    socket.data.user = {
      id: data.user.id,
      username:
        (meta?.["username"] as string | undefined) ??
        data.user.email ??
        "Anonymous",
    };
  } catch {
    socket.data.user = null;
  }

  return next();
}

// ─── Socket server factory ────────────────────────────────────────────────────

export function createSocketServer(httpServer: HttpServer): IoServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env["CLIENT_ORIGIN"] ?? "*",
      methods: ["GET", "POST"],
    },
  });

  // Apply JWT middleware to every connection.
  io.use((socket, next) => {
    attachAuthUser(socket, next).catch(next);
  });

  io.on("connection", (socket) => {
    // Populate legacy playerId / username fields from auth or handshake fallback.
    const username =
      socket.data.user?.username ??
      (socket.handshake.auth as Record<string, string>)["username"] ??
      "Anonymous";

    socket.data.playerId = socket.id;
    socket.data.username = username;

    logger.info(
      `🔌  Socket connected     ${socket.id}  (${socket.data.user?.id ?? "unauthed"} / ${username})`,
    );

    // ── Handler registration ──────────────────────────────────────────────

    // New waiting-room flow (mobile friendly game).
    registerWaitingRoomHandlers(io, socket);

    // Legacy lobby flow (kept for backward compatibility).
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      logger.info(`🔌  Socket disconnected  ${socket.id}  (${reason})`);
    });
  });

  return io;
}
