import { createServer } from "http";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { app } from "./app.js";
import { createSocketServer } from "./socket/index.js";
import { logger } from "./lib/logger.js";
import { connectRedis } from "./lib/redis.js";
import { initSupabase } from "./lib/supabase.js";
import { extractRoutes } from "./lib/routes.js";

// Load the monorepo-root .env.local for local development.
// `override: false` means real environment variables (CI/prod) always win.
// `silent: false` is intentional in dev; the file simply won't exist in prod,
// which is fine — dotenv ignores missing files when there is no throw.
const __dir = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: resolve(__dir, "../../../.env.local"), override: false });

async function bootstrap(): Promise<void> {
  // ── Banner ──────────────────────────────────────────────────────────────────
  logger.banner();

  logger.info("🚀  Poker Server starting…");
  logger.divider();

  // ── External services ────────────────────────────────────────────────────────
  await connectRedis();
  initSupabase();

  logger.divider();

  // ── HTTP server ──────────────────────────────────────────────────────────────
  const httpServer = createServer(app);

  // ── Socket.IO ────────────────────────────────────────────────────────────────
  createSocketServer(httpServer);
  logger.success("Socket.IO initialised");

  logger.divider();

  // ── Registered HTTP routes ───────────────────────────────────────────────────
  const routes = extractRoutes(app);
  if (routes.length > 0) {
    for (const { method, path } of routes) {
      logger.route(method, path);
    }
  } else {
    logger.warn("No HTTP routes detected");
  }

  logger.divider();

  // ── Start listening ───────────────────────────────────────────────────────────
  const PORT = Number(process.env["SERVER_PORT"] ?? process.env["PORT"] ?? 3001);
  const NODE_ENV   = process.env["NODE_ENV"]      ?? "development";
  const CORS_ORIGIN = process.env["CLIENT_ORIGIN"] ?? "*";

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, () => {
      logger.success(`Express server running on http://localhost:${PORT}`);
      logger.env("Environment",  NODE_ENV);
      logger.env("CORS origin",  CORS_ORIGIN);
      logger.env("Redis URL",    process.env["REDIS_URL"]    ?? "redis://localhost:6379 (default)");
      logger.env("Supabase URL", process.env["SUPABASE_URL"] ?? "(not set)");
      logger.divider();
      logger.success("🎮  Ready to accept connections!");
      console.log();
      resolve();
    });
  });
}

bootstrap().catch((err) => {
  logger.error("Fatal: server failed to start", err);
  process.exit(1);
});
