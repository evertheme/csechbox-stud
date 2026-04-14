import { Redis } from "ioredis";
import { logger } from "./logger.js";

let _client: Redis | null = null;

/**
 * Create a Redis connection, emit a structured log line, and return the
 * client.  Returns `null` if the connection cannot be established so the
 * caller can decide whether the failure is fatal.
 */
export async function connectRedis(): Promise<Redis | null> {
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";

  const client = new Redis(url, {
    // Don't immediately connect — we call connect() explicitly so we can
    // catch the error and log it in one place.
    lazyConnect:          true,
    maxRetriesPerRequest: 1,
    connectTimeout:       5_000,
    // Suppress ioredis's own reconnect noise during startup; the logger
    // captures the outcome instead.
    enableOfflineQueue: false,
  });

  try {
    await client.connect();
    logger.success(`Redis connected  →  ${url}`);
    _client = client;

    client.on("error",       (err) => logger.error("Redis error",      err));
    client.on("reconnecting", ()   => logger.warn ("Redis reconnecting…"));
    client.on("ready",        ()   => logger.success("Redis reconnected"));

    return client;
  } catch (err) {
    logger.error(`Redis connection failed  →  ${url}`, err);
    // Release the socket so it doesn't linger.
    client.disconnect();
    return null;
  }
}

/** Returns the active Redis client, or `null` if not yet connected. */
export function getRedis(): Redis | null {
  return _client;
}
