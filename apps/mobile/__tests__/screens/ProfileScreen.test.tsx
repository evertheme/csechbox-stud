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
  Stack: { Screen: () => null },
}));

jest.mock("../../store/auth-store", () => ({ useAuthStore: jest.fn() }));

jest.mock("../../store/game-store", () => ({ useGameStore: jest.fn() }));

jest.mock("zustand/react/shallow", () => ({
  useShallow: (selector: (s: unknown) => unknown) => selector,
}));

jest.mock("../../lib/profileApi", () => ({
  fetchUserProfile: jest.fn(),
  updateUsernameApi: jest.fn(),
  uploadAvatar: jest.fn(),
}));

jest.mock("../../lib/usernameCheck", () => ({
  checkUsernameAvailable: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

// Suppress Alert in tests.
jest.mock("react-native/Libraries/Alert/Alert", () => ({ alert: jest.fn() }));

import { router } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { useGameStore } from "../../store/game-store";
import {
  fetchUserProfile,
  updateUsernameApi,
  uploadAvatar,
} from "../../lib/profileApi";
import { checkUsernameAvailable } from "../../lib/usernameCheck";
import * as ImagePicker from "expo-image-picker";
import ProfileScreen from "../../app/(app)/profile";
import type { UserProfile } from "../../lib/profileApi";
import type { GameStoreState } from "../../store/game-store";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_PROFILE: UserProfile = {
  id: "user-1",
  username: "PokerAce",
  email: "ace@example.com",
  avatarUrl: null,
  chips: 1250,
  createdAt: "2026-01-15T12:00:00.000Z",
  stats: {
    gamesPlayed: 42,
    handsWon: 156,
    winRate: 37,
    totalWinnings: 2340,
    biggestPot: 450,
    favoriteGame: "7 Card Stud",
  },
};

const MOCK_USER = {
  id: "user-1",
  email: "ace@example.com",
  created_at: "2026-01-15T00:00:00.000Z",
  user_metadata: { username: "PokerAce", avatar_url: null },
};

// ─── Game store fixtures ───────────────────────────────────────────────────────

const MOCK_PLAYER = {
  id: "user-1",
  username: "PokerAce",
  chips: 850,
  seatIndex: 0,
  cards: [],
  currentBet: 0,
  folded: false,
  isReady: true,
  isActive: false,
};

const MOCK_ROOM = {
  id: "room-1",
  gameType: "seven-card-stud",
  stakes: { ante: 5, bringIn: 10 },
  maxPlayers: 8,
  players: [MOCK_PLAYER],
  status: "playing" as const,
  createdBy: "user-1",
};

function setupGameStore(
  overrides: Partial<Pick<GameStoreState, "currentRoom" | "myPlayer" | "sessionBuyIns">> = {}
) {
  jest.mocked(useGameStore).mockImplementation((selector: unknown) => {
    const state = {
      currentRoom: null,
      myPlayer: null,
      sessionBuyIns: [] as number[],
      ...overrides,
    };
    if (typeof selector === "function") return selector(state);
    return state;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupStore(overrides = {}) {
  jest.mocked(useAuthStore).mockReturnValue({
    user: MOCK_USER,
    session: { access_token: "tok-abc" },
    chips: 1250,
    updateUsername: jest.fn().mockResolvedValue({ error: null }),
    updateChips: jest.fn(),
    isAuthenticated: true,
    isLoading: false,
    ...overrides,
  } as any);
}

async function renderProfile() {
  render(<ProfileScreen />);
  await waitFor(() =>
    expect(screen.queryByTestId("profile-skeleton")).toBeNull()
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  setupStore();
  setupGameStore();
  jest.mocked(fetchUserProfile).mockResolvedValue(MOCK_PROFILE);
  jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── Loading skeleton ─────────────────────────────────────────────────────────

describe("ProfileScreen — loading", () => {
  it("shows skeleton while fetching", () => {
    jest.mocked(fetchUserProfile).mockReturnValue(new Promise(() => {}));
    render(<ProfileScreen />);
    expect(screen.getByTestId("profile-skeleton")).toBeTruthy();
  });

  it("hides skeleton after data loads", async () => {
    await renderProfile();
    expect(screen.queryByTestId("profile-skeleton")).toBeNull();
  });
});

// ─── Profile data rendering ───────────────────────────────────────────────────

describe("ProfileScreen — data display", () => {
  it("shows the username", async () => {
    await renderProfile();
    expect(screen.getByTestId("username-display").props.children).toBe("PokerAce");
  });

  it("shows the email", async () => {
    await renderProfile();
    expect(screen.getByTestId("email-display").props.children).toBe("ace@example.com");
  });

  it("shows member since date", async () => {
    await renderProfile();
    expect(screen.getByTestId("member-since")).toBeTruthy();
    expect(screen.getByText(/Jan 15, 2026/)).toBeTruthy();
  });

  it('shows "Unlimited" in the balance section', async () => {
    await renderProfile();
    expect(screen.getByTestId("unlimited-row")).toBeTruthy();
    expect(screen.getByText("Unlimited")).toBeTruthy();
  });

  it('shows "Free" badge in the balance section', async () => {
    await renderProfile();
    expect(screen.getByText("Free")).toBeTruthy();
  });

  it("does NOT render the Add Chips button", async () => {
    await renderProfile();
    expect(screen.queryByTestId("btn-add-chips")).toBeNull();
  });

  it("shows avatar placeholder when no avatar URL", async () => {
    await renderProfile();
    expect(screen.getByTestId("avatar-placeholder")).toBeTruthy();
  });

  it("shows avatar image when URL is set", async () => {
    jest.mocked(fetchUserProfile).mockResolvedValue({
      ...MOCK_PROFILE,
      avatarUrl: "https://example.com/avatar.jpg",
    });
    await renderProfile();
    expect(screen.getByTestId("avatar-image")).toBeTruthy();
  });
});

// ─── Stats section ────────────────────────────────────────────────────────────

describe("ProfileScreen — stats", () => {
  it("renders all stat rows", async () => {
    await renderProfile();
    expect(screen.getByTestId("stat-games-played").props.children).toBe(42);
    expect(screen.getByTestId("stat-hands-won").props.children).toBe(156);
    expect(screen.getByTestId("stat-win-rate").props.children).toBe("37%");
    expect(screen.getByText(/\$2,340/)).toBeTruthy();
    expect(screen.getByText(/\$450/)).toBeTruthy();
    expect(screen.getByText("7 Card Stud")).toBeTruthy();
  });

  it("falls back to store data when API fails", async () => {
    jest.mocked(fetchUserProfile).mockRejectedValue(new Error("Network error"));
    await renderProfile();
    // Should still render with user data from store.
    expect(screen.getByTestId("username-display").props.children).toBe("PokerAce");
  });
});

// ─── Username editing ─────────────────────────────────────────────────────────

describe("ProfileScreen — username edit", () => {
  it("shows inline input when Edit is pressed", async () => {
    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    expect(screen.getByTestId("input-username")).toBeTruthy();
  });

  it("cancels editing and restores original username", async () => {
    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    fireEvent.changeText(screen.getByTestId("input-username"), "NewName");
    fireEvent.press(screen.getByTestId("btn-cancel-username"));
    expect(screen.getByTestId("username-display").props.children).toBe("PokerAce");
  });

  it("checks username availability after debounce", async () => {
    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    fireEvent.changeText(screen.getByTestId("input-username"), "NewName1");

    await act(async () => { jest.advanceTimersByTime(500); });

    await waitFor(() =>
      expect(jest.mocked(checkUsernameAvailable)).toHaveBeenCalledWith("NewName1")
    );
  });

  it("shows available hint when username is free", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    fireEvent.changeText(screen.getByTestId("input-username"), "NewName1");

    await act(async () => { jest.advanceTimersByTime(500); });

    await waitFor(() =>
      expect(screen.getByTestId("username-status").props.children).toContain("Available")
    );
  });

  it("shows taken hint when username is unavailable", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(false);
    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    fireEvent.changeText(screen.getByTestId("input-username"), "TakenName");

    await act(async () => { jest.advanceTimersByTime(500); });

    await waitFor(() =>
      expect(screen.getByTestId("username-status").props.children).toContain("taken")
    );
  });

  it("saves username and shows success toast", async () => {
    const updateUsername = jest.fn().mockResolvedValue({ error: null });
    setupStore({ updateUsername });
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);

    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    fireEvent.changeText(screen.getByTestId("input-username"), "NewName1");

    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() => screen.getByTestId("btn-save-username"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-save-username"));
    });

    await waitFor(() => {
      expect(updateUsername).toHaveBeenCalledWith("NewName1");
      expect(screen.getByTestId("toast")).toBeTruthy();
      expect(screen.getByText("Username updated!")).toBeTruthy();
    });
  });

  it("shows error when save fails", async () => {
    const updateUsername = jest.fn().mockResolvedValue({
      error: { message: "Server error" },
    });
    setupStore({ updateUsername });
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);

    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    fireEvent.changeText(screen.getByTestId("input-username"), "NewName1");

    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() => screen.getByTestId("btn-save-username"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-save-username"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("username-error")).toBeTruthy()
    );
  });

  it("disables save button when username is invalid format", async () => {
    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-edit-username"));
    fireEvent.changeText(screen.getByTestId("input-username"), "ab"); // too short
    expect(
      screen.getByTestId("btn-save-username").props.accessibilityState?.disabled
    ).toBe(true);
  });
});

// ─── Avatar change ────────────────────────────────────────────────────────────

describe("ProfileScreen — avatar change", () => {
  it("requests permission and opens picker when Change Photo is pressed", async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      { granted: true } as any
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: true,
      assets: [],
    } as any);

    await renderProfile();
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-change-photo"));
    });

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
  });

  it("uploads image and shows success toast", async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      { granted: true } as any
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///photo.jpg" }],
    } as any);
    jest.mocked(uploadAvatar).mockResolvedValue("https://cdn.example.com/avatar.jpg");

    await renderProfile();
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-change-photo"));
    });

    await waitFor(() => {
      expect(uploadAvatar).toHaveBeenCalledWith("file:///photo.jpg", "user-1");
      expect(screen.getByTestId("toast")).toBeTruthy();
      expect(screen.getByText("Avatar updated!")).toBeTruthy();
    });
  });

  it("shows error toast when upload fails", async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      { granted: true } as any
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///photo.jpg" }],
    } as any);
    jest.mocked(uploadAvatar).mockRejectedValue(new Error("Storage full"));

    await renderProfile();
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-change-photo"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("toast")).toBeTruthy()
    );
    expect(screen.getByText("Storage full")).toBeTruthy();
  });

  it("does nothing when picker is cancelled", async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      { granted: true } as any
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: true,
      assets: [],
    } as any);

    await renderProfile();
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-change-photo"));
    });

    expect(uploadAvatar).not.toHaveBeenCalled();
  });
});

// ─── Balance section — not in game ────────────────────────────────────────────

describe("ProfileScreen — balance section (not in game)", () => {
  it("shows not-in-game message when no active room", async () => {
    setupGameStore({ currentRoom: null, myPlayer: null });
    await renderProfile();
    expect(screen.getByTestId("no-active-game")).toBeTruthy();
    expect(screen.getByText("Not currently in a game")).toBeTruthy();
  });

  it("does NOT show current-session block when not in a room", async () => {
    setupGameStore({ currentRoom: null, myPlayer: null });
    await renderProfile();
    expect(screen.queryByTestId("current-session")).toBeNull();
  });
});

// ─── Balance section — in game ────────────────────────────────────────────────

describe("ProfileScreen — balance section (in game)", () => {
  beforeEach(() => {
    setupGameStore({
      currentRoom: MOCK_ROOM,
      myPlayer: MOCK_PLAYER,
      sessionBuyIns: [1000],
    });
  });

  it("shows the current-session block when in an active room", async () => {
    await renderProfile();
    expect(screen.getByTestId("current-session")).toBeTruthy();
  });

  it("does NOT show the not-in-game message when in a room", async () => {
    await renderProfile();
    expect(screen.queryByTestId("no-active-game")).toBeNull();
  });

  it("shows the current stack", async () => {
    await renderProfile();
    expect(screen.getByTestId("session-stack").props.children).toBe("$850");
  });

  it("shows a single buy-in amount without the count prefix", async () => {
    await renderProfile();
    expect(screen.getByTestId("session-buyins").props.children).toBe("$1,000");
  });

  it("shows multiple buy-ins with count prefix and breakdown", async () => {
    setupGameStore({
      currentRoom: MOCK_ROOM,
      myPlayer: MOCK_PLAYER,
      sessionBuyIns: [1000, 1000],
    });
    await renderProfile();
    expect(screen.getByTestId("session-buyins").props.children).toBe(
      "2x ($1,000+$1,000)"
    );
  });

  it("shows a negative net when stack is below total buy-ins", async () => {
    // Stack 850, buy-ins total 1000 → net -150
    await renderProfile();
    expect(screen.getByTestId("session-net").props.children).toBe("-$150");
  });

  it("shows a positive net when stack is above total buy-ins", async () => {
    setupGameStore({
      currentRoom: MOCK_ROOM,
      myPlayer: { ...MOCK_PLAYER, chips: 1200 },
      sessionBuyIns: [1000],
    });
    await renderProfile();
    expect(screen.getByTestId("session-net").props.children).toBe("+$200");
  });

  it("shows em-dash net when no buy-ins are recorded yet", async () => {
    setupGameStore({
      currentRoom: MOCK_ROOM,
      myPlayer: MOCK_PLAYER,
      sessionBuyIns: [],
    });
    await renderProfile();
    expect(screen.getByTestId("session-net").props.children).toBe("—");
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe("ProfileScreen — navigation", () => {
  it("navigates to stats screen", async () => {
    await renderProfile();
    fireEvent.press(screen.getByTestId("btn-full-stats"));
    expect(router.push).toHaveBeenCalledWith("/(app)/stats");
  });
});

// ─── Pull to refresh ──────────────────────────────────────────────────────────

describe("ProfileScreen — pull to refresh", () => {
  it("re-fetches profile on refresh", async () => {
    await renderProfile();
    expect(fetchUserProfile).toHaveBeenCalledTimes(1);

    // RefreshControl doesn't expose testID in the test renderer;
    // trigger onRefresh via the ScrollView's refreshControl prop instead.
    const scrollView = screen.getByTestId("profile-scroll");
    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() =>
      expect(fetchUserProfile).toHaveBeenCalledTimes(2)
    );
  });
});
