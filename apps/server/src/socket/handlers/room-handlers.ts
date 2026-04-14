import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "@poker/shared-types";
import { roomStore } from "../../store/room-store.js";

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerRoomHandlers(io: IoServer, socket: IoSocket) {
  socket.on("room:create", (name, callback) => {
    try {
      const room = roomStore.createRoom(name);
      callback(room);
      io.emit("room:list", roomStore.listRooms());
    } catch (err) {
      socket.emit("error", String(err));
    }
  });

  socket.on("room:join", async (roomId, callback) => {
    const room = roomStore.getRoom(roomId);
    if (!room) {
      callback(null);
      socket.emit("error", `Room ${roomId} not found`);
      return;
    }

    await socket.join(roomId);
    socket.data.roomId = roomId;

    roomStore.updateRoom(roomId, { playerCount: room.playerCount + 1 });

    io.to(roomId).emit("game:player-joined", {
      id: socket.data.playerId,
      username: socket.data.username,
      chipCount: 0,
      status: "active",
      seatIndex: room.playerCount,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
      currentBet: 0,
      totalBetInRound: 0,
      hasHoleCards: false,
    });

    callback(null);
  });

  socket.on("room:leave", async (roomId) => {
    await socket.leave(roomId);
    const room = roomStore.getRoom(roomId);
    if (room) {
      roomStore.updateRoom(roomId, { playerCount: Math.max(0, room.playerCount - 1) });
    }
    io.to(roomId).emit("game:player-left", socket.data.playerId);
    delete socket.data.roomId;
  });
}
