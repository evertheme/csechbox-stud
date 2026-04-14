import { supabase } from "./supabase";

/**
 * Returns true if the username is not already taken, false if it is.
 * Fails open (returns true) on any network or schema error so registration
 * is never blocked by an unavailable check.
 *
 * Abstracting this into its own module makes it easy to mock in tests.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .ilike("username", username)
      .limit(1);

    if (error) return true; // fail open
    return !data || data.length === 0;
  } catch {
    return true; // fail open
  }
}
