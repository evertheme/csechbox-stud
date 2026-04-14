import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

let _client: SupabaseClient | null = null;

/**
 * Initialise the Supabase admin client (service-role key).
 * Logs a warning and returns `null` when env vars are missing so the server
 * can still boot in a degraded state during local development.
 */
export function initSupabase(): SupabaseClient | null {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_KEY"];

  if (!url || !key) {
    logger.warn(
      "Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY to enable",
    );
    return null;
  }

  try {
    _client = createClient(url, key, {
      auth: {
        // Server-side: no browser session persistence needed.
        persistSession:    false,
        autoRefreshToken:  false,
        detectSessionInUrl: false,
      },
    });

    logger.success(`Supabase client ready  →  ${url}`);
    return _client;
  } catch (err) {
    logger.error("Supabase initialisation failed", err);
    return null;
  }
}

/** Returns the active Supabase client, or `null` if not initialised. */
export function getSupabase(): SupabaseClient | null {
  return _client;
}
