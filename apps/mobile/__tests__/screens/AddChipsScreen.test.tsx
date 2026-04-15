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
  formatDollars: jest.requireActual("../../lib/statsApi").formatDollars,
}));

import { router } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { fetchDetailedStats } from "../../lib/statsApi";
import AddChipsScreen from "../../app/(app)/add-chips";
import type { DetailedStats } from "../../lib/statsApi";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_STATS: DetailedStats = {
  totalGames: 24,
  gamesWon: 14,
  winRate: 58.3,
  currentStreak: 3,
  currentStreakType: "W",
  bestStreak: 7,
  bestStreakType: "W",
  handsPlayed: 480,
  handsWon: 192,
  showdownWinRate: 54,
  foldRate: 28,
  totalWinnings: 18200,
  totalLosses: 7400,
  netProfit: 10800,
  biggestWin: 2340,
  biggestLoss: -890,
  avgPotWon: 340,
  bestHands: {
    royalFlush: 0,
    straightFlush: 1,
    fourOfAKind: 3,
    fullHouse: 12,
    flush: 24,
    straight: 31,
  },
  winRateHistory: [],
  gameTypeDistribution: [],
  recentGames: [],
};

const MOCK_USER = { id: "user-123" };
const MOCK_SESSION = { access_token: "tok", user: MOCK_USER };

function mockStore(overrides: Partial<{ user: unknown; session: unknown }> = {}) {
  jest.mocked(useAuthStore).mockReturnValue({
    user: MOCK_USER,
    session: MOCK_SESSION,
    ...overrides,
  } as ReturnType<typeof useAuthStore>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore();
  jest.mocked(fetchDetailedStats).mockResolvedValue(MOCK_STATS);
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("AddChipsScreen — rendering", () => {
  it("renders the scroll view", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("add-chips-scroll"));
    expect(screen.getByTestId("add-chips-scroll")).toBeTruthy();
  });

  it("renders the unlimited card", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("unlimited-card"));
    expect(screen.getByTestId("unlimited-card")).toBeTruthy();
  });

  it('shows "Unlimited" heading', async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByText("Unlimited"));
    expect(screen.getByText("Unlimited")).toBeTruthy();
  });

  it("shows friendly-game copy", async () => {
    render(<AddChipsScreen />);
    await waitFor(() =>
      screen.getByText("In a friendly game, chips are free and unlimited!")
    );
  });

  it("shows rebuy copy", async () => {
    render(<AddChipsScreen />);
    await waitFor(() =>
      screen.getByText("You can rebuy anytime between hands.")
    );
  });

  it("renders the session history card", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("session-history-card"));
  });

  it('shows "Your Session History" header', async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByText("Your Session History"));
  });

  it("renders the View All Sessions button", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("btn-view-sessions"));
  });

  it("does NOT render chip packages", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("unlimited-card"));
    expect(screen.queryByTestId("package-card-small")).toBeNull();
    expect(screen.queryByTestId("package-card-medium")).toBeNull();
    expect(screen.queryByTestId("btn-purchase")).toBeNull();
  });

  it("does NOT render the daily claim card", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("unlimited-card"));
    expect(screen.queryByTestId("daily-claim-card")).toBeNull();
    expect(screen.queryByTestId("btn-claim")).toBeNull();
  });
});

// ─── Stats loading ────────────────────────────────────────────────────────────

describe("AddChipsScreen — session stats", () => {
  it("shows a loader while fetching", () => {
    jest.mocked(fetchDetailedStats).mockReturnValue(new Promise(() => undefined));
    render(<AddChipsScreen />);
    expect(screen.getByTestId("stats-loader")).toBeTruthy();
  });

  it("shows stats rows after data loads", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("stats-rows"));
    expect(screen.getByTestId("stats-rows")).toBeTruthy();
  });

  it("shows correct total sessions", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("stat-total-sessions"));
    expect(screen.getByTestId("stat-total-sessions").props.children).toBe("24");
  });

  it("shows correct average profit per session", async () => {
    // netProfit 10800 / totalGames 24 = 450
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("stat-avg-profit"));
    expect(screen.getByTestId("stat-avg-profit").props.children).toBe("+$450");
  });

  it("shows correct best session", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("stat-best-session"));
    expect(screen.getByTestId("stat-best-session").props.children).toBe("+$2,340");
  });

  it("shows correct worst session", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("stat-worst-session"));
    expect(screen.getByTestId("stat-worst-session").props.children).toBe("-$890");
  });

  it("shows no-stats message when fetch fails", async () => {
    jest.mocked(fetchDetailedStats).mockRejectedValue(new Error("network"));
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("no-stats"));
    expect(screen.getByTestId("no-stats")).toBeTruthy();
  });

  it("shows no-stats message when there is no user", async () => {
    mockStore({ user: null, session: null });
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("no-stats"));
  });

  it("does not call fetchDetailedStats when there is no user", async () => {
    mockStore({ user: null, session: null });
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("no-stats"));
    expect(jest.mocked(fetchDetailedStats)).not.toHaveBeenCalled();
  });

  it("shows a dash for avg profit when totalGames is 0", async () => {
    jest.mocked(fetchDetailedStats).mockResolvedValue({
      ...MOCK_STATS,
      totalGames: 0,
      netProfit: 0,
    });
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("stat-avg-profit"));
    expect(screen.getByTestId("stat-avg-profit").props.children).toBe("—");
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe("AddChipsScreen — navigation", () => {
  it("navigates to stats screen when View All Sessions is pressed", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("btn-view-sessions"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-view-sessions"));
    });
    expect(jest.mocked(router.push)).toHaveBeenCalledWith("/(app)/stats");
  });
});
