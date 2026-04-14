import express from "express";
import cors from "cors";
import { roomRouter } from "./routes/rooms.js";

export const app = express();

app.use(cors({ origin: process.env["CLIENT_ORIGIN"] ?? "*" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/rooms", roomRouter);
