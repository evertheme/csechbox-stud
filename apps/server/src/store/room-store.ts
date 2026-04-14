import type { GameRoom, GameSettings } from "@poker/shared-types";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_SETTINGS: GameSettings = {
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 200,
  maxBuyIn: 2000,
  maxPlayers: 9,
  turnTimeoutSeconds: 30,
};

class RoomStore {
  private rooms = new Map<string, GameRoom>();

  createRoom(name: string, settings: Partial<GameSettings> = {}): GameRoom {
    const id = uuidv4();
    const room: GameRoom = {
      id,
      name,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      playerCount: 0,
      maxPlayers: settings.maxPlayers ?? DEFAULT_SETTINGS.maxPlayers,
      isStarted: false,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): GameRoom | undefined {
    return this.rooms.get(id);
  }

  listRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  updateRoom(id: string, updates: Partial<GameRoom>): GameRoom | undefined {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    const updated = { ...room, ...updates };
    this.rooms.set(id, updated);
    return updated;
  }

  deleteRoom(id: string): boolean {
    return this.rooms.delete(id);
  }
}

export const roomStore = new RoomStore();
