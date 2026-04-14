/**
 * auth-store tests.
 *
 * Testing strategy
 * ────────────────
 * • The store is tested directly via useAuthStore.getState() — no React
 *   rendering is needed because Zustand actions are plain async functions.
 * • supabase and expo-router are fully mocked.
 * • The onAuthStateChange callback is captured so tests can simulate events.
 * • Store state is reset to initial values before every test to prevent
 *   cross-test pollution.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
}));

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));

import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/auth-store";

// ─── Mock handles ─────────────────────────────────────────────────────────────

const mockGetSession = jest.mocked(supabase.auth.getSession);
const mockOnAuthStateChange = jest.mocked(supabase.auth.onAuthStateChange);
const mockSignOut = jest.mocked(supabase.auth.signOut);
const mockUpdateUser = jest.mocked(supabase.auth.updateUser);

const mockUnsubscribe = jest.fn();

// Captured during each initialize() call so tests can fire auth events.
let capturedAuthCallback: (event: string, session: typeof mockSession | null) => void;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  user_metadata: { username: "testuser", chips: 500 },
} as any;

const mockSession = {
  user: mockUser,
  access_token: "test-token",
  refresh_token: "refresh-token",
  expires_at: Date.now() / 1000 + 3600,
} as any;

const INITIAL_STATE = {
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  chips: 0,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Reset store state so tests are fully isolated.
  useAuthStore.setState(INITIAL_STATE);

  // Default mock implementations.
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: null,
  } as any);

  mockOnAuthStateChange.mockImplementation((callback: any) => {
    capturedAuthCallback = callback;
    return {
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    } as any;
  });

  mockSignOut.mockResolvedValue({ error: null } as any);

  mockUpdateUser.mockResolvedValue({
    data: { user: mockUser },
    error: null,
  } as any);
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe("useAuthStore — initial state", () => {
  it("has null user and session", () => {
    const { user, session } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(session).toBeNull();
  });

  it("starts as loading and not authenticated", () => {
    const { isLoading, isAuthenticated } = useAuthStore.getState();
    expect(isLoading).toBe(true);
    expect(isAuthenticated).toBe(false);
  });

  it("starts with 0 chips", () => {
    expect(useAuthStore.getState().chips).toBe(0);
  });
});

// ─── Setters ──────────────────────────────────────────────────────────────────

describe("useAuthStore — setUser", () => {
  it("updates user in state", () => {
    useAuthStore.getState().setUser(mockUser);
    expect(useAuthStore.getState().user).toBe(mockUser);
  });

  it("clears user when passed null", () => {
    useAuthStore.setState({ user: mockUser });
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe("useAuthStore — setSession", () => {
  it("sets session, user, and isAuthenticated from a session object", () => {
    useAuthStore.getState().setSession(mockSession);
    const state = useAuthStore.getState();
    expect(state.session).toBe(mockSession);
    expect(state.user).toBe(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it("clears session, user, and isAuthenticated when passed null", () => {
    useAuthStore.setState({ session: mockSession, user: mockUser, isAuthenticated: true });
    useAuthStore.getState().setSession(null);
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});

// ─── initialize ───────────────────────────────────────────────────────────────

describe("useAuthStore — initialize()", () => {
  it("sets isLoading to false after resolving", async () => {
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("leaves user and session null when no persisted session exists", async () => {
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("populates user, session, and isAuthenticated from persisted session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null } as any);
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.session).toBe(mockSession);
    expect(state.user).toBe(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it("reads chips from user metadata on session restore", async () => {
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null } as any);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().chips).toBe(500);
  });

  it("defaults chips to 0 when metadata has no chips field", async () => {
    const sessionNoChips = {
      ...mockSession,
      user: { ...mockUser, user_metadata: { username: "testuser" } },
    };
    mockGetSession.mockResolvedValue({ data: { session: sessionNoChips }, error: null } as any);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().chips).toBe(0);
  });

  it("calls supabase.auth.getSession exactly once", async () => {
    await useAuthStore.getState().initialize();
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("registers an onAuthStateChange listener", async () => {
    await useAuthStore.getState().initialize();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes the previous listener when called a second time", async () => {
    // First call sets up the subscription. Clear the mock count so any
    // unsubscribe triggered by a previous test does not pollute this assertion.
    await useAuthStore.getState().initialize();
    mockUnsubscribe.mockClear();

    // Second call should unsubscribe exactly the subscription created above.
    await useAuthStore.getState().initialize();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

// ─── Auth state listener ──────────────────────────────────────────────────────

describe("useAuthStore — onAuthStateChange listener", () => {
  beforeEach(async () => {
    // Initialize so the listener is registered and capturedAuthCallback is set.
    await useAuthStore.getState().initialize();
  });

  it("updates state when a SIGNED_IN event fires", () => {
    capturedAuthCallback("SIGNED_IN", mockSession);
    const state = useAuthStore.getState();
    expect(state.session).toBe(mockSession);
    expect(state.user).toBe(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.chips).toBe(500);
  });

  it("reads chips from metadata on SIGNED_IN when present", () => {
    const richSession = {
      ...mockSession,
      user: { ...mockUser, user_metadata: { chips: 1200 } },
    };
    capturedAuthCallback("SIGNED_IN", richSession);
    expect(useAuthStore.getState().chips).toBe(1200);
  });

  it("preserves existing chips on TOKEN_REFRESHED when metadata has no chips", () => {
    useAuthStore.setState({ chips: 800 });
    const sessionNoChips = {
      ...mockSession,
      user: { ...mockUser, user_metadata: {} },
    };
    capturedAuthCallback("TOKEN_REFRESHED", sessionNoChips);
    expect(useAuthStore.getState().chips).toBe(800);
  });

  it("clears session, user, isAuthenticated and chips on SIGNED_OUT", () => {
    // Simulate a previously authenticated state.
    useAuthStore.setState({ session: mockSession, user: mockUser, isAuthenticated: true, chips: 500 });
    capturedAuthCallback("SIGNED_OUT", null);
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.chips).toBe(0);
  });

  it("updates state on USER_UPDATED event", () => {
    const updatedSession = {
      ...mockSession,
      user: { ...mockUser, user_metadata: { username: "renamed" } },
    };
    capturedAuthCallback("USER_UPDATED", updatedSession);
    expect(useAuthStore.getState().user?.user_metadata.username).toBe("renamed");
  });
});

// ─── signOut ─────────────────────────────────────────────────────────────────

describe("useAuthStore — signOut()", () => {
  beforeEach(() => {
    // Seed an authenticated state so we can verify the clear.
    useAuthStore.setState({
      session: mockSession,
      user: mockUser,
      isAuthenticated: true,
      chips: 500,
      isLoading: false,
    });
  });

  it("calls supabase.auth.signOut", async () => {
    await useAuthStore.getState().signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("clears session, user, isAuthenticated and chips", async () => {
    await useAuthStore.getState().signOut();
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.chips).toBe(0);
  });

  it("navigates to /(auth)", async () => {
    await useAuthStore.getState().signOut();
    expect(router.replace).toHaveBeenCalledWith("/(auth)");
  });

  it("navigates after clearing state (order matters)", async () => {
    const calls: string[] = [];
    mockSignOut.mockImplementation(async () => {
      calls.push("signOut");
      return { error: null } as any;
    });
    jest.mocked(router.replace).mockImplementation(() => {
      calls.push("navigate");
    });

    await useAuthStore.getState().signOut();
    expect(calls).toEqual(["signOut", "navigate"]);
  });
});

// ─── updateUsername ───────────────────────────────────────────────────────────

describe("useAuthStore — updateUsername()", () => {
  it("calls supabase.auth.updateUser with the new username", async () => {
    await useAuthStore.getState().updateUsername("newname");
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { username: "newname" } });
  });

  it("updates user in state on success", async () => {
    const updatedUser = { ...mockUser, user_metadata: { username: "newname" } };
    mockUpdateUser.mockResolvedValue({ data: { user: updatedUser }, error: null } as any);
    await useAuthStore.getState().updateUsername("newname");
    expect(useAuthStore.getState().user).toBe(updatedUser);
  });

  it("returns null error on success", async () => {
    const { error } = await useAuthStore.getState().updateUsername("newname");
    expect(error).toBeNull();
  });

  it("returns the error object when updateUser fails", async () => {
    const mockError = { message: "Auth error" } as any;
    mockUpdateUser.mockResolvedValue({ data: { user: null }, error: mockError } as any);
    const { error } = await useAuthStore.getState().updateUsername("newname");
    expect(error).toBe(mockError);
  });

  it("does not update user in state when updateUser fails", async () => {
    useAuthStore.setState({ user: mockUser });
    mockUpdateUser.mockResolvedValue({ data: { user: null }, error: { message: "fail" } } as any);
    await useAuthStore.getState().updateUsername("newname");
    expect(useAuthStore.getState().user).toBe(mockUser);
  });
});

// ─── updateChips ─────────────────────────────────────────────────────────────

describe("useAuthStore — updateChips()", () => {
  it("sets chips to the provided amount", () => {
    useAuthStore.getState().updateChips(750);
    expect(useAuthStore.getState().chips).toBe(750);
  });

  it("can set chips to 0", () => {
    useAuthStore.setState({ chips: 500 });
    useAuthStore.getState().updateChips(0);
    expect(useAuthStore.getState().chips).toBe(0);
  });

  it("overwrites previous chip count", () => {
    useAuthStore.getState().updateChips(100);
    useAuthStore.getState().updateChips(9999);
    expect(useAuthStore.getState().chips).toBe(9999);
  });
});
