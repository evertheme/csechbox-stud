import type { GameRoom } from "../types/game";

const API_URL =
  process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3001";

/**
 * Fetch the current list of active game rooms from the REST API.
 * Pass the Supabase access token so the server can verify the caller.
 */
export async function fetchGames(token?: string | null): Promise<GameRoom[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api/rooms`, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch games (${response.status})`);
  }

  return response.json() as Promise<GameRoom[]>;
}
