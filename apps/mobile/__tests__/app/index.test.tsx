/**
 * Index route (app/index.tsx) tests.
 *
 * The index route is purely a redirect gate — it reads isAuthenticated and
 * isLoading from the auth store and renders the appropriate <Redirect />.
 * We mock expo-router's Redirect to capture the target href.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ─── Module mocks ─────────────────────────────────────────────────────────────
// Factory uses require() so it can safely reference Text after hoisting.

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  const R = require("react");
  return {
    // Render the href as visible text so tests can use getByText / queryByText.
    Redirect: ({ href }: { href: string }) =>
      R.createElement(Text, { testID: "redirect", accessibilityLabel: href }, href),
  };
});

jest.mock("../../store/auth-store", () => ({
  useAuthStore: jest.fn(),
}));

import { useAuthStore } from "../../store/auth-store";
import Index from "../../app/index";

// ─── Helper ───────────────────────────────────────────────────────────────────

function setupStore(opts: { isAuthenticated: boolean; isLoading: boolean }) {
  jest.mocked(useAuthStore).mockReturnValue(opts as any);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Index — loading state", () => {
  it("renders nothing while isLoading is true", () => {
    setupStore({ isAuthenticated: false, isLoading: true });
    const { toJSON } = render(<Index />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing while isLoading is true regardless of auth state", () => {
    setupStore({ isAuthenticated: true, isLoading: true });
    const { toJSON } = render(<Index />);
    expect(toJSON()).toBeNull();
  });

  it("does NOT render a Redirect while loading", () => {
    setupStore({ isAuthenticated: false, isLoading: true });
    render(<Index />);
    expect(screen.queryByTestId("redirect")).toBeNull();
  });
});

describe("Index — authenticated redirect", () => {
  it("redirects to /(app)/lobby when authenticated", () => {
    setupStore({ isAuthenticated: true, isLoading: false });
    render(<Index />);
    expect(screen.getByTestId("redirect")).toBeTruthy();
    expect(screen.getByText("/(app)/lobby")).toBeTruthy();
  });

  it("redirects to lobby (not auth) when session is active", () => {
    setupStore({ isAuthenticated: true, isLoading: false });
    render(<Index />);
    expect(screen.queryByText("/(auth)")).toBeNull();
  });
});

describe("Index — unauthenticated redirect", () => {
  it("redirects to /(auth) when not authenticated", () => {
    setupStore({ isAuthenticated: false, isLoading: false });
    render(<Index />);
    expect(screen.getByTestId("redirect")).toBeTruthy();
    expect(screen.getByText("/(auth)")).toBeTruthy();
  });

  it("redirects to auth (not lobby) when no session", () => {
    setupStore({ isAuthenticated: false, isLoading: false });
    render(<Index />);
    expect(screen.queryByText("/(app)/lobby")).toBeNull();
  });
});
