import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) =>
      require("react").createElement(
        require("react-native").View,
        { testID: "stack-screen", ...options }
      ),
  },
}));

jest.mock("../../store/auth-store", () => ({
  useAuthStore: jest.fn(),
}));

jest.mock("../../lib/statsApi", () => ({
  fetchDetailedStats: jest.fn(),
  timeAgo: jest.fn((iso: string) => {
    const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    return `${hrs}h ago`;
  }),
  formatDollars: jest.fn((n: number) => {
    const abs = Math.abs(n).toLocaleString("en-US");
    return n < 0 ? `-$${abs}` : `$${abs}`;
  }),
}));

// chart-kit uses react-native-svg — mock both to avoid native module errors.
jest.mock("react-native-chart-kit", () => {
  const { View, Text } = require("react-native");
  return {
    LineChart: ({ testID }: { testID?: string }) =>
      require("react").createElement(View, { testID: testID ?? "line-chart" }),
    PieChart: ({ testID }: { testID?: string }) =>
      require("react").createElement(View, { testID: testID ?? "pie-chart" }),
  };
});

jest.mock("react-native-svg", () => ({}));

import { router } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { fetchDetailedStats } from "../../lib/statsApi";
import StatsScreen from "../../app/(app)/stats";
import type { DetailedStats } from "../../lib/statsApi";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER = { id: "user-1", email: "ace@poker.com" };
const MOCK_SESSION = { access_token: "tok-abc" };

const MOCK_STATS: DetailedStats = {
  totalGames: 42,
  gamesWon: 15,
  winRate: 35.7,
  currentStreak: 3,
  currentStreakType: "W",
  bestStreak: 7,
  bestStreakType: "W",
  handsPlayed: 524,
  handsWon: 156,
  showdownWinRate: 42,
  foldRate: 38,
  totalWinnings: 2340,
  totalLosses: 1890,
  netProfit: 450,
  biggestWin: 450,
  biggestLoss: 280,
  avgPotWon: 45,
  bestHands: {
    royalFlush: 1,
    straightFlush: 3,
    fourOfAKind: 8,
    fullHouse: 24,
    flush: 47,
    straight: 61,
  },
  winRateHistory: [
    { date: "2026-01-01", winRate: 30 },
    { date: "2026-01-08", winRate: 33 },
    { date: "2026-01-15", winRate: 35.7 },
  ],
  gameTypeDistribution: [
    { gameType: "7 Card Stud", count: 25 },
    { gameType: "Razz", count: 10 },
    { gameType: "5 Card Stud", count: 7 },
  ],
  recentGames: [
    {
      id: "g1",
      gameType: "7 Card Stud",
      playedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      result: "won",
      amountDelta: 125,
      position: 1,
      totalPlayers: 6,
    },
    {
      id: "g2",
      gameType: "Razz",
      playedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      result: "lost",
      amountDelta: -50,
      position: 4,
      totalPlayers: 5,
    },
  ],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

function mockStore(overrides = {}) {
  jest.mocked(useAuthStore).mockReturnValue({
    user: MOCK_USER,
    session: MOCK_SESSION,
    ...overrides,
  } as ReturnType<typeof useAuthStore>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchDetailedStats).mockResolvedValue(MOCK_STATS);
  mockStore();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("StatsScreen — rendering", () => {
  it("shows a loading skeleton while fetching", async () => {
    jest.mocked(fetchDetailedStats).mockReturnValue(new Promise(() => {}));
    render(<StatsScreen />);
    expect(screen.getByTestId("stats-skeleton")).toBeTruthy();
  });

  it("renders the tab bar", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("tab-bar"));
    expect(screen.getByTestId("tab-overview")).toBeTruthy();
    expect(screen.getByTestId("tab-history")).toBeTruthy();
  });

  it("shows the Overview tab by default", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("overview-tab"));
  });

  it("renders error message when fetch fails", async () => {
    jest.mocked(fetchDetailedStats).mockRejectedValue(new Error("Server down"));
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("error-message"));
    expect(screen.getByTestId("error-message").props.children).toMatch(
      /could not load/i
    );
  });
});

// ─── Overview tab — games ──────────────────────────────────────────────────────

describe("StatsScreen — Overview tab: Games Overview", () => {
  it("displays Total Games", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-total-games"));
    expect(screen.getByTestId("stat-total-games").props.children).toBe("42");
  });

  it("displays Games Won", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-games-won"));
    expect(screen.getByTestId("stat-games-won").props.children).toBe("15");
  });

  it("displays Win Rate with one decimal", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-win-rate"));
    expect(screen.getByTestId("stat-win-rate").props.children).toBe("35.7%");
  });

  it("displays Current Streak as '3W'", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-current-streak"));
    expect(screen.getByTestId("stat-current-streak").props.children).toBe("3W");
  });

  it("displays Best Streak as '7W'", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-best-streak"));
    expect(screen.getByTestId("stat-best-streak").props.children).toBe("7W");
  });

  it("shows '—' when currentStreak is 0", async () => {
    jest.mocked(fetchDetailedStats).mockResolvedValue({
      ...MOCK_STATS,
      currentStreak: 0,
      currentStreakType: null,
    });
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-current-streak"));
    expect(screen.getByTestId("stat-current-streak").props.children).toBe("—");
  });
});

// ─── Overview tab — hands ─────────────────────────────────────────────────────

describe("StatsScreen — Overview tab: Hand Statistics", () => {
  it("displays Hands Played", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-hands-played"));
    expect(screen.getByTestId("stat-hands-played").props.children).toBe("524");
  });

  it("displays Hands Won", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-hands-won"));
    expect(screen.getByTestId("stat-hands-won").props.children).toBe("156");
  });

  it("displays Showdown Win Rate", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-showdown-win-rate"));
    expect(screen.getByTestId("stat-showdown-win-rate").props.children).toBe("42%");
  });

  it("displays Fold Rate", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-fold-rate"));
    expect(screen.getByTestId("stat-fold-rate").props.children).toBe("38%");
  });
});

// ─── Overview tab — financial ─────────────────────────────────────────────────

describe("StatsScreen — Overview tab: Financial Stats", () => {
  it("displays Total Winnings", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-total-winnings"));
    // formatDollars mock returns "$2,340"
    expect(screen.getByTestId("stat-total-winnings").props.children).toBe("$2,340");
  });

  it("displays Net Profit with + prefix when positive", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-net-profit"));
    // prefix is added by the screen: "+$450"
    expect(screen.getByTestId("stat-net-profit").props.children).toBe("+$450");
  });

  it("displays Net Profit without + prefix when negative", async () => {
    jest.mocked(fetchDetailedStats).mockResolvedValue({
      ...MOCK_STATS,
      netProfit: -200,
    });
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-net-profit"));
    expect(screen.getByTestId("stat-net-profit").props.children).toBe("-$200");
  });

  it("displays Biggest Win", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-biggest-win"));
    expect(screen.getByTestId("stat-biggest-win").props.children).toBe("$450");
  });
});

// ─── Overview tab — best hands ────────────────────────────────────────────────

describe("StatsScreen — Overview tab: Best Hands", () => {
  it("displays Royal Flush count", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-royal-flush"));
    expect(screen.getByTestId("stat-royal-flush").props.children).toBe("1");
  });

  it("displays Straight Flush count", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-straight-flush"));
    expect(screen.getByTestId("stat-straight-flush").props.children).toBe("3");
  });

  it("displays Four of a Kind count", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-four-of-a-kind"));
    expect(screen.getByTestId("stat-four-of-a-kind").props.children).toBe("8");
  });

  it("displays Full House count", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stat-full-house"));
    expect(screen.getByTestId("stat-full-house").props.children).toBe("24");
  });
});

// ─── Charts ───────────────────────────────────────────────────────────────────

describe("StatsScreen — Charts", () => {
  it("renders the line chart wrapper when win-rate history has 2+ points", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("line-chart-wrapper"));
  });

  it("does NOT render line chart wrapper when history has < 2 points", async () => {
    jest.mocked(fetchDetailedStats).mockResolvedValue({
      ...MOCK_STATS,
      winRateHistory: [{ date: "2026-01-01", winRate: 30 }],
    });
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("overview-tab"));
    expect(screen.queryByTestId("line-chart-wrapper")).toBeNull();
  });

  it("renders the pie chart wrapper when game distribution is non-empty", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("pie-chart-wrapper"));
  });

  it("does NOT render pie chart wrapper when distribution is empty", async () => {
    jest.mocked(fetchDetailedStats).mockResolvedValue({
      ...MOCK_STATS,
      gameTypeDistribution: [],
    });
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("overview-tab"));
    expect(screen.queryByTestId("pie-chart-wrapper")).toBeNull();
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe("StatsScreen — tab switching", () => {
  it("switches to History tab when pressed", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("tab-history"));
    fireEvent.press(screen.getByTestId("tab-history"));
    await waitFor(() => screen.getByTestId("history-tab"));
  });

  it("switches back to Overview when pressed", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("tab-history"));
    fireEvent.press(screen.getByTestId("tab-history"));
    await waitFor(() => screen.getByTestId("history-tab"));
    fireEvent.press(screen.getByTestId("tab-overview"));
    await waitFor(() => screen.getByTestId("overview-tab"));
  });
});

// ─── History tab ──────────────────────────────────────────────────────────────

describe("StatsScreen — History tab", () => {
  async function openHistory() {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("tab-history"));
    fireEvent.press(screen.getByTestId("tab-history"));
    await waitFor(() => screen.getByTestId("history-tab"));
  }

  it("shows a history item for each recent game", async () => {
    await openHistory();
    expect(screen.getByTestId("history-item-g1")).toBeTruthy();
    expect(screen.getByTestId("history-item-g2")).toBeTruthy();
  });

  it("shows game type in each history item", async () => {
    await openHistory();
    expect(screen.getByText("7 Card Stud")).toBeTruthy();
    expect(screen.getByText("Razz")).toBeTruthy();
  });

  it("shows Won for a winning game", async () => {
    await openHistory();
    expect(screen.getByText(/won/i)).toBeTruthy();
  });

  it("shows Lost for a losing game", async () => {
    await openHistory();
    expect(screen.getByText(/lost/i)).toBeTruthy();
  });

  it("shows position/totalPlayers", async () => {
    await openHistory();
    expect(screen.getByText("1/6")).toBeTruthy();
    expect(screen.getByText("4/5")).toBeTruthy();
  });

  it("navigates to game-details when a history item is pressed", async () => {
    await openHistory();
    fireEvent.press(screen.getByTestId("history-item-g1"));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith(
      "/(app)/game-details/g1"
    );
  });

  it("shows empty state when there are no recent games", async () => {
    jest.mocked(fetchDetailedStats).mockResolvedValue({
      ...MOCK_STATS,
      recentGames: [],
    });
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("tab-history"));
    fireEvent.press(screen.getByTestId("tab-history"));
    await waitFor(() => screen.getByTestId("history-empty"));
    expect(screen.getByText(/no games yet/i)).toBeTruthy();
  });
});

// ─── Pull-to-refresh ──────────────────────────────────────────────────────────

describe("StatsScreen — pull-to-refresh", () => {
  it("re-fetches stats on refresh", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stats-scroll"));

    await act(async () => {
      screen
        .getByTestId("stats-scroll")
        .props.refreshControl.props.onRefresh();
    });

    await waitFor(() =>
      expect(jest.mocked(fetchDetailedStats)).toHaveBeenCalledTimes(2)
    );
  });
});

// ─── API call ─────────────────────────────────────────────────────────────────

describe("StatsScreen — API", () => {
  it("calls fetchDetailedStats with userId and access token", async () => {
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stats-scroll"));
    expect(jest.mocked(fetchDetailedStats)).toHaveBeenCalledWith(
      "user-1",
      "tok-abc"
    );
  });

  it("passes null token when session is null", async () => {
    mockStore({ session: null });
    render(<StatsScreen />);
    await waitFor(() => screen.getByTestId("stats-scroll"));
    expect(jest.mocked(fetchDetailedStats)).toHaveBeenCalledWith(
      "user-1",
      null
    );
  });

  it("does not call fetch when user is null", async () => {
    mockStore({ user: null });
    render(<StatsScreen />);
    // Give a tick for useEffect.
    await act(async () => {});
    expect(jest.mocked(fetchDetailedStats)).not.toHaveBeenCalled();
  });
});
