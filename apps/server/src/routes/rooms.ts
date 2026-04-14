import { Router } from "express";
import { roomStore } from "../store/room-store.js";

export const roomRouter: Router = Router();

roomRouter.get("/", (_req, res) => {
  res.json(roomStore.listRooms());
});

roomRouter.get("/:id", (req, res) => {
  const room = roomStore.getRoom(req.params["id"]!);
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(room);
});
