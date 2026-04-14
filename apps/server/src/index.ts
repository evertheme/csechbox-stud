import { createServer } from "http";
import { app } from "./app.js";
import { createSocketServer } from "./socket/index.js";

const PORT = process.env["PORT"] ?? 3001;

const httpServer = createServer(app);
createSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});
