import { supabase } from "./supabase";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserStats {
  gamesPlayed: number;
  handsWon: number;
  winRate: number;
  totalWinnings: number;
  biggestPot: number;
  favoriteGame: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  chips: number;
  createdAt: string;
  stats: UserStats;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/** Fetch the current user's full profile + stats from the server. */
export async function fetchUserProfile(
  token: string | null
): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/api/users/me`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch profile (${res.status})`);
  return res.json() as Promise<UserProfile>;
}

/** Update the current user's username on the server. */
export async function updateUsernameApi(
  username: string,
  token: string | null
): Promise<void> {
  const res = await fetch(`${API_URL}/api/users/me`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Failed to update username (${res.status})`);
  }
}

// ─── Avatar upload ────────────────────────────────────────────────────────────

/**
 * Upload an image URI to Supabase Storage and return the public URL.
 * Uses the "avatars" bucket — create it in your Supabase dashboard with
 * public read access.
 */
export async function uploadAvatar(
  uri: string,
  userId: string
): Promise<string> {
  // Fetch the local file as a blob.
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
