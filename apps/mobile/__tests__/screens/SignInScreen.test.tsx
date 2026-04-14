/**
 * SignInScreen tests.
 *
 * Biometric strategy:
 * - expo-local-authentication and expo-secure-store are fully mocked so tests
 *   never touch real hardware or storage.
 * - The biometric check runs in a useEffect; helpers that need the button
 *   present use waitFor() to wait for state to settle after mock resolution.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { router } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import SignInScreen, {
  BIOMETRIC_EMAIL_KEY,
  BIOMETRIC_PASSWORD_KEY,
} from "../../app/(auth)/sign-in";

// ─── Mock handles ─────────────────────────────────────────────────────────────

const mockSignIn = jest.fn();
const mockHasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const mockIsEnrolled = jest.mocked(LocalAuthentication.isEnrolledAsync);
const mockAuthenticate = jest.mocked(LocalAuthentication.authenticateAsync);
const mockSupportedTypes = jest.mocked(
  LocalAuthentication.supportedAuthenticationTypesAsync
);
const mockGetItem = jest.mocked(SecureStore.getItemAsync);
const mockSetItem = jest.mocked(SecureStore.setItemAsync);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Default: no biometric hardware available. */
function setupNoBiometric() {
  mockHasHardware.mockResolvedValue(false);
  mockIsEnrolled.mockResolvedValue(false);
  mockGetItem.mockResolvedValue(null);
}

/**
 * Configure biometric mocks so the button appears.
 * Waits for the useEffect to settle.
 */
async function renderWithBiometric(opts: {
  type?: "fingerprint" | "face";
  hasStoredCreds?: boolean;
} = {}) {
  const { type = "fingerprint", hasStoredCreds = true } = opts;

  mockHasHardware.mockResolvedValue(true);
  mockIsEnrolled.mockResolvedValue(true);
  mockSupportedTypes.mockResolvedValue([
    type === "face"
      ? LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      : LocalAuthentication.AuthenticationType.FINGERPRINT,
  ]);
  mockGetItem.mockImplementation((key) =>
    Promise.resolve(
      hasStoredCreds
        ? key === BIOMETRIC_EMAIL_KEY
          ? "saved@example.com"
          : "savedpass123"
        : null
    )
  );

  render(<SignInScreen />);

  if (hasStoredCreds) {
    await waitFor(() =>
      expect(screen.getByTestId("btn-biometric")).toBeTruthy()
    );
  } else {
    // Let the effect settle but confirm button is absent.
    await act(async () => {});
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  jest.mocked(useAuth).mockReturnValue({ signIn: mockSignIn } as any);
  setupNoBiometric(); // safe default — most tests don't use biometrics
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("SignInScreen — rendering", () => {
  it("renders email and password fields", () => {
    render(<SignInScreen />);
    expect(screen.getByTestId("input-email")).toBeTruthy();
    expect(screen.getByTestId("input-password")).toBeTruthy();
  });

  it("renders correct placeholders", () => {
    render(<SignInScreen />);
    expect(screen.getByPlaceholderText("your@email.com")).toBeTruthy();
    expect(screen.getByPlaceholderText("••••••••")).toBeTruthy();
  });

  it("renders the Sign In button", () => {
    render(<SignInScreen />);
    expect(screen.getByTestId("btn-submit")).toBeTruthy();
    expect(screen.getByText("Sign In")).toBeTruthy();
  });

  it("renders a Forgot password link", () => {
    render(<SignInScreen />);
    expect(screen.getByTestId("link-forgot")).toBeTruthy();
    expect(screen.getByText("Forgot password?")).toBeTruthy();
  });

  it("renders a Remember me toggle", () => {
    render(<SignInScreen />);
    expect(screen.getByTestId("toggle-remember")).toBeTruthy();
    expect(screen.getByText("Remember me")).toBeTruthy();
  });

  it("renders a show/hide password toggle", () => {
    render(<SignInScreen />);
    expect(screen.getByTestId("toggle-password")).toBeTruthy();
  });

  it("renders a Sign Up footer link", () => {
    render(<SignInScreen />);
    expect(screen.getByTestId("link-signup")).toBeTruthy();
  });

  it("does NOT render the biometric button when no hardware available", async () => {
    render(<SignInScreen />);
    await act(async () => {});
    expect(screen.queryByTestId("btn-biometric")).toBeNull();
  });
});

// ─── Password visibility ──────────────────────────────────────────────────────

describe("SignInScreen — password visibility", () => {
  it("hides password text by default", () => {
    render(<SignInScreen />);
    expect(screen.getByTestId("input-password").props.secureTextEntry).toBe(
      true
    );
  });

  it("shows password text after pressing the toggle", async () => {
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId("toggle-password"));
    await waitFor(() =>
      expect(
        screen.getByTestId("input-password").props.secureTextEntry
      ).toBe(false)
    );
  });

  it("hides password again after pressing toggle twice", async () => {
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId("toggle-password"));
    fireEvent.press(screen.getByTestId("toggle-password"));
    await waitFor(() =>
      expect(
        screen.getByTestId("input-password").props.secureTextEntry
      ).toBe(true)
    );
  });
});

// ─── Remember me ─────────────────────────────────────────────────────────────

describe("SignInScreen — Remember me", () => {
  it("checkbox starts unchecked", () => {
    render(<SignInScreen />);
    expect(
      screen.getByTestId("toggle-remember").props.accessibilityState?.checked
    ).toBe(false);
  });

  it("toggles checked state when pressed", async () => {
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId("toggle-remember"));
    await waitFor(() =>
      expect(
        screen.getByTestId("toggle-remember").props.accessibilityState?.checked
      ).toBe(true)
    );
  });

  it("saves credentials to SecureStore after successful sign-in with Remember me checked", async () => {
    render(<SignInScreen />);
    fireEvent.changeText(
      screen.getByTestId("input-email"),
      "user@example.com"
    );
    fireEvent.changeText(screen.getByTestId("input-password"), "password123");
    fireEvent.press(screen.getByTestId("toggle-remember"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-submit"));
    });

    await waitFor(() =>
      expect(mockSetItem).toHaveBeenCalledWith(
        BIOMETRIC_EMAIL_KEY,
        "user@example.com"
      )
    );
    expect(mockSetItem).toHaveBeenCalledWith(
      BIOMETRIC_PASSWORD_KEY,
      "password123"
    );
  });

  it("does NOT save credentials when Remember me is unchecked", async () => {
    render(<SignInScreen />);
    fireEvent.changeText(
      screen.getByTestId("input-email"),
      "user@example.com"
    );
    fireEvent.changeText(screen.getByTestId("input-password"), "password123");
    // Do NOT press the toggle.

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-submit"));
    });

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledTimes(1)
    );
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

// ─── Form validation & submission ─────────────────────────────────────────────

describe("SignInScreen — form validation", () => {
  it("shows error when both fields are empty", async () => {
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId("btn-submit"));
    await waitFor(() =>
      expect(screen.getByText("Please fill in all fields.")).toBeTruthy()
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows error when email is filled but password is empty", async () => {
    render(<SignInScreen />);
    fireEvent.changeText(
      screen.getByTestId("input-email"),
      "a@b.com"
    );
    fireEvent.press(screen.getByTestId("btn-submit"));
    await waitFor(() =>
      expect(screen.getByText("Please fill in all fields.")).toBeTruthy()
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows error when password is filled but email is empty", async () => {
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId("input-password"), "secret");
    fireEvent.press(screen.getByTestId("btn-submit"));
    await waitFor(() =>
      expect(screen.getByText("Please fill in all fields.")).toBeTruthy()
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("calls signIn with trimmed email and password", async () => {
    render(<SignInScreen />);
    fireEvent.changeText(
      screen.getByTestId("input-email"),
      "  user@example.com  "
    );
    fireEvent.changeText(screen.getByTestId("input-password"), "secret123");

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-submit"));
    });

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "secret123")
    );
  });

  it("shows 'Invalid email or password' on any signIn error", async () => {
    mockSignIn.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId("input-email"), "bad@email.com");
    fireEvent.changeText(screen.getByTestId("input-password"), "wrongpass");

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-submit"));
    });

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeTruthy()
    );
    expect(screen.queryByText("Invalid login credentials")).toBeNull();
  });

  it("shows a spinner during submission", async () => {
    let resolveSignIn!: (v: { error: null }) => void;
    mockSignIn.mockImplementation(
      () => new Promise<{ error: null }>((resolve) => { resolveSignIn = resolve; })
    );
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByTestId("input-email"), "a@b.com");
    fireEvent.changeText(screen.getByTestId("input-password"), "secret123");
    fireEvent.press(screen.getByTestId("btn-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("submit-spinner")).toBeTruthy()
    );
    // Clean up to prevent open handles.
    await act(async () => { resolveSignIn({ error: null }); });
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe("SignInScreen — navigation", () => {
  it("goes back when the back button is pressed", () => {
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId("btn-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("navigates to forgot-password when the link is pressed", () => {
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId("link-forgot"));
    expect(router.push).toHaveBeenCalledWith("/(auth)/forgot-password");
  });

  it("navigates to sign-up when the footer link is pressed", () => {
    render(<SignInScreen />);
    fireEvent.press(screen.getByTestId("link-signup"));
    expect(router.replace).toHaveBeenCalledWith("/(auth)/sign-up");
  });
});

// ─── Biometric — visibility ───────────────────────────────────────────────────

describe("SignInScreen — biometric button visibility", () => {
  it("does not show biometric button when hardware present but no stored credentials", async () => {
    await renderWithBiometric({ hasStoredCreds: false });
    expect(screen.queryByTestId("btn-biometric")).toBeNull();
  });

  it("shows biometric button when hardware + enrollment + stored credentials", async () => {
    await renderWithBiometric({ hasStoredCreds: true });
    expect(screen.getByTestId("btn-biometric")).toBeTruthy();
  });

  it("shows 'Sign in with Touch ID' label for fingerprint hardware", async () => {
    await renderWithBiometric({ type: "fingerprint" });
    expect(screen.getByText(/Sign in with Touch ID/)).toBeTruthy();
  });

  it("shows 'Sign in with Face ID' label for facial recognition hardware", async () => {
    await renderWithBiometric({ type: "face" });
    expect(screen.getByText(/Sign in with Face ID/)).toBeTruthy();
  });
});

// ─── Biometric — auth flow ────────────────────────────────────────────────────

describe("SignInScreen — biometric authentication", () => {
  it("calls signIn with stored credentials on successful biometric auth", async () => {
    mockAuthenticate.mockResolvedValue({ success: true } as any);
    await renderWithBiometric();

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-biometric"));
    });

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith(
        "saved@example.com",
        "savedpass123"
      )
    );
  });

  it("shows error when biometric auth succeeds but signIn fails", async () => {
    mockAuthenticate.mockResolvedValue({ success: true } as any);
    mockSignIn.mockResolvedValue({ error: { message: "session expired" } });
    await renderWithBiometric();

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-biometric"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("biometric-error")).toBeTruthy()
    );
    expect(
      screen.getByText("Biometric sign-in failed. Please use your password.")
    ).toBeTruthy();
  });

  it("shows error when biometric authentication fails (non-cancel)", async () => {
    mockAuthenticate.mockResolvedValue({
      success: false,
      error: "lockout",
    } as any);
    await renderWithBiometric();

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-biometric"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("biometric-error")).toBeTruthy()
    );
    expect(
      screen.getByText("Biometric authentication failed. Please try again.")
    ).toBeTruthy();
  });

  it("shows NO error when user cancels biometric prompt", async () => {
    mockAuthenticate.mockResolvedValue({
      success: false,
      error: "user_cancel",
    } as any);
    await renderWithBiometric();

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-biometric"));
    });

    await waitFor(() =>
      expect(mockAuthenticate).toHaveBeenCalledTimes(1)
    );
    expect(screen.queryByTestId("biometric-error")).toBeNull();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows NO error when system cancels biometric prompt", async () => {
    mockAuthenticate.mockResolvedValue({
      success: false,
      error: "system_cancel",
    } as any);
    await renderWithBiometric();

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-biometric"));
    });

    await waitFor(() =>
      expect(mockAuthenticate).toHaveBeenCalledTimes(1)
    );
    expect(screen.queryByTestId("biometric-error")).toBeNull();
  });

  it("passes the correct promptMessage to authenticateAsync", async () => {
    mockAuthenticate.mockResolvedValue({ success: false, error: "user_cancel" } as any);
    await renderWithBiometric();

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-biometric"));
    });

    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalled());
    expect(mockAuthenticate).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: "Sign in to Poker Stud" })
    );
  });
});
