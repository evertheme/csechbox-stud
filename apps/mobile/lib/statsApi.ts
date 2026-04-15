const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameHistory {
  id: string;
  gameType: string;
  playedAt: string; // ISO string
  result: "won" | "lost";
  amountDelta: number; // positive = won, negative = lost
  position: number;
  totalPlayers: number;
}

export interface BestHands {
  royalFlush: number;
  straightFlush: number;
  fourOfAKind: number;
  fullHouse: number;
  flush: number;
  straight: number;
}

export interface WinRatePoint {
  /** ISO date string (e.g. "2026-01-15") */
  date: string;
  /** Cumulative win-rate at that point, 0–100 */
  winRate: number;
}

export interface GameTypeDistribution {
  gameType: string;
  count: number;
}

export interface DetailedStats {
  // Games overview
  totalGames: number;
  gamesWon: number;
  winRate: number;
  currentStreak: number;
  currentStreakType: "W" | "L" | null;
  bestStreak: number;
  bestStreakType: "W" | "L";
  // Hand stats
  handsPlayed: number;
  handsWon: number;
  showdownWinRate: number;
  foldRate: number;
  // Financial
  totalWinnings: number;
  totalLosses: number;
  netProfit: number;
  biggestWin: number;
  biggestLoss: number;
  avgPotWon: number;
  // Best hands
  bestHands: BestHands;
  // Chart data
  winRateHistory: WinRatePoint[];
  gameTypeDistribution: GameTypeDistribution[];
  // Recent games
  recentGames: GameHistory[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/** Fetch detailed stats for a user. */
export async function fetchDetailedStats(
  userId: string,
  token: string | null
): Promise<DetailedStats> {
  const res = await fetch(`${API_URL}/api/users/${userId}/stats`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch stats (${res.status})`);
  return res.json() as Promise<DetailedStats>;
}

// ─── Relative time helper ─────────────────────────────────────────────────────

/**
 * Returns a short human-readable "time ago" string for an ISO date.
 * e.g. "2h ago", "3d ago", "just now"
 */
export function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Format a dollar amount as "$1,234" or "-$1,234". */
export function formatDollars(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US");
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}
