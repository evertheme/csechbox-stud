import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

// expo-linear-gradient renders native views; replace with a plain View in tests.
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("../../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { router } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import WelcomeScreen from "../../app/(auth)/index";

const mockSignInAnonymously = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockSignInAnonymously.mockResolvedValue({ error: null });
  jest.mocked(useAuth).mockReturnValue({
    signInAnonymously: mockSignInAnonymously,
  } as any);
});

// ─── Static content ───────────────────────────────────────────────────────────

describe("WelcomeScreen — static content", () => {
  it("renders the spade logo", () => {
    render(<WelcomeScreen />);
    expect(screen.getByTestId("logo")).toBeTruthy();
    expect(screen.getByTestId("logo").props.children).toBe("♠");
  });

  it("renders the app title 'Poker Stud'", () => {
    render(<WelcomeScreen />);
    expect(screen.getByTestId("title")).toBeTruthy();
    expect(screen.getByText("Poker Stud")).toBeTruthy();
  });

  it("renders the tagline", () => {
    render(<WelcomeScreen />);
    expect(screen.getByTestId("tagline")).toBeTruthy();
    expect(screen.getByText("Play Classic Stud Poker Online")).toBeTruthy();
  });

  it("renders Sign Up, Sign In and Continue as Guest buttons", () => {
    render(<WelcomeScreen />);
    expect(screen.getByTestId("btn-signup")).toBeTruthy();
    expect(screen.getByTestId("btn-signin")).toBeTruthy();
    expect(screen.getByTestId("btn-guest")).toBeTruthy();
  });

  it("renders the correct button labels", () => {
    render(<WelcomeScreen />);
    expect(screen.getByText("Sign Up")).toBeTruthy();
    expect(screen.getByText("Sign In")).toBeTruthy();
    expect(screen.getByText("Continue as Guest")).toBeTruthy();
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe("WelcomeScreen — navigation", () => {
  it("navigates to /(auth)/sign-up when Sign Up is pressed", () => {
    render(<WelcomeScreen />);
    fireEvent.press(screen.getByTestId("btn-signup"));
    expect(router.push).toHaveBeenCalledWith("/(auth)/sign-up");
  });

  it("navigates to /(auth)/sign-in when Sign In is pressed", () => {
    render(<WelcomeScreen />);
    fireEvent.press(screen.getByTestId("btn-signin"));
    expect(router.push).toHaveBeenCalledWith("/(auth)/sign-in");
  });
});

// ─── Guest auth ───────────────────────────────────────────────────────────────

describe("WelcomeScreen — Continue as Guest", () => {
  it("calls signInAnonymously when the button is pressed", async () => {
    render(<WelcomeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-guest"));
    });
    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("shows a loading spinner while guest auth is in progress", async () => {
    // Keep the promise pending so the loading state stays visible.
    let resolveAuth!: (v: { error: null }) => void;
    mockSignInAnonymously.mockReturnValue(
      new Promise<{ error: null }>((res) => { resolveAuth = res; })
    );

    render(<WelcomeScreen />);
    fireEvent.press(screen.getByTestId("btn-guest"));

    await waitFor(() =>
      expect(screen.getByTestId("guest-spinner")).toBeTruthy()
    );

    // Clean up: resolve the promise so the component un-mounts cleanly.
    await act(async () => { resolveAuth({ error: null }); });
  });

  it("hides the spinner and shows the button text again after auth completes", async () => {
    render(<WelcomeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-guest"));
    });
    await waitFor(() =>
      expect(screen.getByText("Continue as Guest")).toBeTruthy()
    );
    expect(screen.queryByTestId("guest-spinner")).toBeNull();
  });

  it("shows an error toast when signInAnonymously fails", async () => {
    mockSignInAnonymously.mockResolvedValue({
      error: { message: "Anonymous sign-in is disabled" },
    });
    render(<WelcomeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-guest"));
    });
    await waitFor(() =>
      expect(screen.getByText("⚠ Anonymous sign-in is disabled")).toBeTruthy()
    );
  });

  it("does not navigate manually on success — AuthContext redirect handles it", async () => {
    render(<WelcomeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-guest"));
    });
    // signInAnonymously succeeds; the screen itself must NOT call router.replace/push.
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("disables the guest button while loading", async () => {
    let resolveAuth!: (v: { error: null }) => void;
    mockSignInAnonymously.mockReturnValue(
      new Promise<{ error: null }>((res) => { resolveAuth = res; })
    );

    render(<WelcomeScreen />);
    fireEvent.press(screen.getByTestId("btn-guest"));

    await waitFor(() => {
      // The Pressable's accessibilityState.disabled should be true
      const btn = screen.getByTestId("btn-guest");
      expect(btn.props.accessibilityState?.disabled).toBe(true);
    });

    await act(async () => { resolveAuth({ error: null }); });
  });
});
