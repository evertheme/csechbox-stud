/**
 * RootLayout (_layout.tsx) tests.
 *
 * Focus areas
 * ───────────
 * • initialize() is called exactly once on mount.
 * • SplashScreen renders while isLoading is true.
 * • <Slot /> renders (loading hidden) once isLoading becomes false.
 * • StatusBar is mounted.
 * • AuthProvider wraps the content.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// ─── Module mocks ─────────────────────────────────────────────────────────────
// All factories use require() internally — jest.mock is hoisted before imports
// so JSX and imported identifiers cannot be referenced directly.

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  const R = require("react");
  return {
    Slot: () => R.createElement(Text, { testID: "slot" }, "slot"),
  };
});

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

jest.mock("../../context/AuthContext", () => ({
  // Pass-through wrapper: renders children directly.
  AuthProvider: ({ children }: { children: any }) => children ?? null,
}));

jest.mock("../../store/auth-store", () => ({
  useAuthStore: jest.fn(),
}));

import { useAuthStore } from "../../store/auth-store";
import RootLayout from "../../app/_layout";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockInitialize = jest.fn();

function setupStore(isLoading: boolean) {
  jest.mocked(useAuthStore).mockReturnValue({
    isLoading,
    initialize: mockInitialize,
  } as any);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockInitialize.mockResolvedValue(undefined);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RootLayout — initialization", () => {
  it("calls initialize() on mount", () => {
    setupStore(false);
    render(<RootLayout />);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it("calls initialize() exactly once even across re-renders", () => {
    setupStore(false);
    const { rerender } = render(<RootLayout />);
    rerender(<RootLayout />);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });
});

describe("RootLayout — splash / loading state", () => {
  it("shows the splash screen while isLoading is true", () => {
    setupStore(true);
    render(<RootLayout />);
    expect(screen.getByTestId("splash-screen")).toBeTruthy();
    expect(screen.getByTestId("splash-indicator")).toBeTruthy();
  });

  it("shows the slot AND the splash screen simultaneously while isLoading is true", () => {
    // Slot is always rendered so Expo Router's navigator is mounted.
    // The splash screen overlays it — both coexist while loading.
    setupStore(true);
    render(<RootLayout />);
    expect(screen.getByTestId("splash-screen")).toBeTruthy();
    expect(screen.getByTestId("slot")).toBeTruthy();
  });

  it("hides the splash screen once isLoading is false", () => {
    setupStore(false);
    render(<RootLayout />);
    expect(screen.queryByTestId("splash-screen")).toBeNull();
    expect(screen.queryByTestId("splash-indicator")).toBeNull();
  });

  it("renders the Slot once isLoading is false", () => {
    setupStore(false);
    render(<RootLayout />);
    expect(screen.getByTestId("slot")).toBeTruthy();
  });

  it("transitions from splash to slot when isLoading changes", () => {
    setupStore(true);
    const { rerender } = render(<RootLayout />);
    expect(screen.getByTestId("splash-screen")).toBeTruthy();

    // Simulate store updating isLoading to false.
    setupStore(false);
    rerender(<RootLayout />);
    expect(screen.queryByTestId("splash-screen")).toBeNull();
    expect(screen.getByTestId("slot")).toBeTruthy();
  });
});
