import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

// ─── expo-router mock ─────────────────────────────────────────────────────────
// jest.mock is hoisted before const bindings, so mock factories must NOT
// reference outer variables.  We use jest.fn() inline and access mocks via
// jest.mocked() after import.

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useSegments: jest.fn(),
}));

import { useRouter, useSegments } from "expo-router";

// ─── Supabase mock ────────────────────────────────────────────────────────────

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      signInAnonymously: jest.fn(),
    },
  },
}));

import { supabase } from "../../lib/supabase";

// Typed mock helpers
const mockedGetSession = jest.mocked(supabase.auth.getSession);
const mockedOnAuthChange = jest.mocked(supabase.auth.onAuthStateChange);
const mockedSignUp = jest.mocked(supabase.auth.signUp);
const mockedSignIn = jest.mocked(supabase.auth.signInWithPassword);
const mockedSignOut = jest.mocked(supabase.auth.signOut);
const mockedResetPwd = jest.mocked(supabase.auth.resetPasswordForEmail);
const mockedAnonSignIn = jest.mocked(supabase.auth.signInAnonymously);

import { AuthProvider, useAuth } from "../../context/AuthContext";
import type { Session } from "@supabase/supabase-js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function buildSession(email = "user@example.com"): Session {
  return {
    user: {
      id: "uid-1",
      email,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    },
    access_token: "tok",
    refresh_token: "ref",
    expires_in: 3600,
    token_type: "bearer",
  } as unknown as Session;
}

const mockUnsubscribe = jest.fn();
const mockReplace = jest.fn();

function TestConsumer() {
  const auth = useAuth();
  return (
    <Text testID="status">
      {auth.isLoading ? "loading" : auth.session ? "authed" : "anon"}
    </Text>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSegments).mockReturnValue([] as unknown as ReturnType<typeof useSegments>);
  jest.mocked(useRouter).mockReturnValue({ replace: mockReplace } as unknown as ReturnType<typeof useRouter>);
  mockedGetSession.mockResolvedValue({ data: { session: null }, error: null } as any);
  mockedOnAuthChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  } as any);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useAuth", () => {
  it("throws when consumed outside AuthProvider", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useAuth must be used inside <AuthProvider>"
    );
  });
});

describe("AuthProvider — session initialisation", () => {
  it("shows anon after loading when no session exists", async () => {
    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status").props.children).toBe("anon")
    );
  });

  it("shows authed when getSession returns a session", async () => {
    mockedGetSession.mockResolvedValue({ data: { session: buildSession() }, error: null } as any);
    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status").props.children).toBe("authed")
    );
  });

  it("subscribes to onAuthStateChange and unsubscribes on unmount", async () => {
    const { unmount } = renderWithProvider();
    await waitFor(() => expect(mockedOnAuthChange).toHaveBeenCalledTimes(1));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("updates session when the auth state change callback fires", async () => {
    let capturedCallback: ((event: string, session: Session | null) => void) | null = null;
    mockedOnAuthChange.mockImplementation((cb) => {
      capturedCallback = cb as typeof capturedCallback;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } } as any;
    });

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status").props.children).toBe("anon")
    );

    await act(async () => {
      capturedCallback!("SIGNED_IN", buildSession());
    });

    expect(screen.getByTestId("status").props.children).toBe("authed");
  });
});

describe("AuthProvider — redirect logic", () => {
  it("redirects unauthenticated user to /(auth) when outside auth group", async () => {
    jest.mocked(useSegments).mockReturnValue(["(app)"] as unknown as ReturnType<typeof useSegments>);
    renderWithProvider();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(auth)"));
  });

  it("redirects authenticated user to /(app)/lobby when in auth group", async () => {
    mockedGetSession.mockResolvedValue({ data: { session: buildSession() }, error: null } as any);
    jest.mocked(useSegments).mockReturnValue(["(auth)"] as unknown as ReturnType<typeof useSegments>);
    renderWithProvider();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(app)/lobby"));
  });

  it("does not redirect when unauthenticated and already in auth group", async () => {
    jest.mocked(useSegments).mockReturnValue(["(auth)"] as unknown as ReturnType<typeof useSegments>);
    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status").props.children).toBe("anon")
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not redirect when authenticated and outside auth group", async () => {
    mockedGetSession.mockResolvedValue({ data: { session: buildSession() }, error: null } as any);
    jest.mocked(useSegments).mockReturnValue(["(app)"] as unknown as ReturnType<typeof useSegments>);
    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status").props.children).toBe("authed")
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("AuthProvider — auth methods", () => {
  function MethodConsumer({ action }: { action: (auth: ReturnType<typeof useAuth>) => void }) {
    const auth = useAuth();
    React.useEffect(() => { action(auth); }, []);
    return null;
  }

  // RTL's render() already wraps itself in act(); do not double-wrap.
  function renderAndAct(action: (auth: ReturnType<typeof useAuth>) => void) {
    render(
      <AuthProvider>
        <MethodConsumer action={action} />
      </AuthProvider>
    );
  }

  it("signUp delegates to supabase.auth.signUp with email, password and username metadata", async () => {
    mockedSignUp.mockResolvedValue({ data: {}, error: null } as any);
    await renderAndAct((auth) => auth.signUp("a@b.com", "password123", "testuser"));
    await waitFor(() =>
      expect(mockedSignUp).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "password123",
        options: { data: { username: "testuser" } },
      })
    );
  });

  it("signIn delegates to supabase.auth.signInWithPassword", async () => {
    mockedSignIn.mockResolvedValue({ data: {}, error: null } as any);
    await renderAndAct((auth) => auth.signIn("a@b.com", "password123"));
    await waitFor(() =>
      expect(mockedSignIn).toHaveBeenCalledWith({ email: "a@b.com", password: "password123" })
    );
  });

  it("signOut delegates to supabase.auth.signOut", async () => {
    mockedSignOut.mockResolvedValue({ error: null } as any);
    await renderAndAct((auth) => auth.signOut());
    await waitFor(() => expect(mockedSignOut).toHaveBeenCalledTimes(1));
  });

  it("resetPassword delegates to supabase.auth.resetPasswordForEmail", async () => {
    mockedResetPwd.mockResolvedValue({ data: {}, error: null } as any);
    await renderAndAct((auth) => auth.resetPassword("a@b.com"));
    await waitFor(() => expect(mockedResetPwd).toHaveBeenCalledWith("a@b.com"));
  });

  it("signInAnonymously delegates to supabase.auth.signInAnonymously with a Guest username", async () => {
    mockedAnonSignIn.mockResolvedValue({ data: {}, error: null } as any);
    await renderAndAct((auth) => auth.signInAnonymously());
    await waitFor(() => {
      expect(mockedAnonSignIn).toHaveBeenCalledTimes(1);
      const [callArgs] = mockedAnonSignIn.mock.calls[0] as [{ options: { data: { username: string } } }];
      expect(callArgs.options.data.username).toMatch(/^Guest_[A-Z0-9]{6}$/);
    });
  });

  it("signInAnonymously returns the Supabase error on failure", async () => {
    mockedAnonSignIn.mockResolvedValue({ data: {}, error: { message: "Anonymous sign-in disabled" } } as any);
    let result: { error: any } | undefined;
    render(
      <AuthProvider>
        <MethodConsumer action={async (auth) => { result = await auth.signInAnonymously(); }} />
      </AuthProvider>
    );
    await waitFor(() => expect(result?.error?.message).toBe("Anonymous sign-in disabled"));
  });

  it("signIn returns the Supabase error on failure", async () => {
    const supabaseError = { message: "Invalid credentials" } as any;
    mockedSignIn.mockResolvedValue({ data: {}, error: supabaseError } as any);
    let result: { error: any } | undefined;
    render(
      <AuthProvider>
        <MethodConsumer
          action={async (auth) => {
            result = await auth.signIn("bad@b.com", "wrong");
          }}
        />
      </AuthProvider>
    );
    await waitFor(() => expect(result?.error?.message).toBe("Invalid credentials"));
  });
});
