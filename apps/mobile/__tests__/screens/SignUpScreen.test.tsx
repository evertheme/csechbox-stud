/**
 * SignUpScreen tests.
 *
 * Strategy notes:
 * - React Hook Form validates on change ("mode: onChange"), so we fire
 *   changeText + blur to reliably trigger validation messages.
 * - The username availability check is debounced (500 ms).  We use
 *   jest.useFakeTimers() so tests don't wait for real wallclock time.
 * - checkUsernameAvailable is mocked to control "available" vs "taken" results.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));

// Mock the username check so we control availability without Supabase.
jest.mock("../../lib/usernameCheck", () => ({ checkUsernameAvailable: jest.fn() }));

import { router } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { checkUsernameAvailable } from "../../lib/usernameCheck";
import SignUpScreen from "../../app/(auth)/sign-up";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockSignUp = jest.fn();
const mockCheckUsername = jest.mocked(checkUsernameAvailable);

/** Fill every field with valid values and advance debounce so username = available. */
async function fillValidForm(opts: {
  username?: string;
  email?: string;
  password?: string;
  confirm?: string;
} = {}) {
  const {
    username = "valid_user",
    email = "user@example.com",
    password = "Password1",
    confirm = "Password1",
  } = opts;

  fireEvent.changeText(screen.getByTestId("input-username"), username);
  // Advance the 500 ms debounce so the availability check fires.
  await act(async () => { jest.advanceTimersByTime(500); });

  fireEvent.changeText(screen.getByTestId("input-email"), email);
  fireEvent(screen.getByTestId("input-email"), "blur");

  fireEvent.changeText(screen.getByTestId("input-password"), password);
  fireEvent(screen.getByTestId("input-password"), "blur");

  fireEvent.changeText(screen.getByTestId("input-confirm"), confirm);
  fireEvent(screen.getByTestId("input-confirm"), "blur");
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue({ error: null });
  mockCheckUsername.mockResolvedValue(true); // default: available
  jest.mocked(useAuth).mockReturnValue({ signUp: mockSignUp } as any);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("SignUpScreen — rendering", () => {
  it("renders all four input fields", () => {
    render(<SignUpScreen />);
    expect(screen.getByTestId("input-username")).toBeTruthy();
    expect(screen.getByTestId("input-email")).toBeTruthy();
    expect(screen.getByTestId("input-password")).toBeTruthy();
    expect(screen.getByTestId("input-confirm")).toBeTruthy();
  });

  it("renders the correct placeholders", () => {
    render(<SignUpScreen />);
    expect(screen.getByPlaceholderText("Choose a username")).toBeTruthy();
    expect(screen.getByPlaceholderText("your@email.com")).toBeTruthy();
    expect(screen.getByPlaceholderText("Create password")).toBeTruthy();
    expect(screen.getByPlaceholderText("Repeat your password")).toBeTruthy();
  });

  it("renders the Create Account button", () => {
    render(<SignUpScreen />);
    expect(screen.getByTestId("btn-submit")).toBeTruthy();
    expect(screen.getByText("Create Account")).toBeTruthy();
  });

  it("renders show/hide toggles for both password fields", () => {
    render(<SignUpScreen />);
    expect(screen.getByTestId("toggle-password")).toBeTruthy();
    expect(screen.getByTestId("toggle-confirm")).toBeTruthy();
  });
});

// ─── Username validation ──────────────────────────────────────────────────────

describe("SignUpScreen — username validation", () => {
  it("shows error when username is too short (< 3 chars)", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "ab");
    fireEvent(screen.getByTestId("input-username"), "blur");
    await waitFor(() =>
      expect(screen.getByText("At least 3 characters")).toBeTruthy()
    );
  });

  it("shows error when username exceeds 20 chars", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "a".repeat(21));
    fireEvent(screen.getByTestId("input-username"), "blur");
    await waitFor(() =>
      expect(screen.getByText("Maximum 20 characters")).toBeTruthy()
    );
  });

  it("shows error when username contains invalid characters", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "user@name");
    fireEvent(screen.getByTestId("input-username"), "blur");
    await waitFor(() =>
      expect(screen.getByText("Letters, numbers and underscores only")).toBeTruthy()
    );
  });

  it("accepts usernames with letters, numbers and underscores", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "valid_User1");
    fireEvent(screen.getByTestId("input-username"), "blur");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(screen.queryByText("Letters, numbers and underscores only")).toBeNull()
    );
  });
});

// ─── Username availability ────────────────────────────────────────────────────

describe("SignUpScreen — username availability check", () => {
  it("shows 'Checking…' while the debounce is in flight", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "newuser");
    // Don't advance timers yet — still in debounce window.
    await waitFor(() =>
      expect(screen.getByTestId("username-status-checking")).toBeTruthy()
    );
  });

  it("shows '✓ Available' when username is free", async () => {
    mockCheckUsername.mockResolvedValue(true);
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "newuser");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(screen.getByTestId("username-status-available")).toBeTruthy()
    );
    expect(screen.getByText("✓ Available")).toBeTruthy();
  });

  it("shows '✗ Already taken' when username is taken", async () => {
    mockCheckUsername.mockResolvedValue(false);
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "takenuser");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(screen.getByTestId("username-status-taken")).toBeTruthy()
    );
    expect(screen.getByText("✗ Already taken")).toBeTruthy();
  });

  it("does not call checkUsernameAvailable for invalid-format usernames", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-username"), "ab"); // too short
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(mockCheckUsername).not.toHaveBeenCalled();
  });
});

// ─── Email validation ─────────────────────────────────────────────────────────

describe("SignUpScreen — email validation", () => {
  it("shows error for an invalid email format", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-email"), "notanemail");
    fireEvent(screen.getByTestId("input-email"), "blur");
    await waitFor(() =>
      expect(screen.getByText("Enter a valid email address")).toBeTruthy()
    );
  });

  it("accepts a valid email", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-email"), "ok@example.com");
    fireEvent(screen.getByTestId("input-email"), "blur");
    await waitFor(() =>
      expect(screen.queryByText("Enter a valid email address")).toBeNull()
    );
  });
});

// ─── Password validation ──────────────────────────────────────────────────────

describe("SignUpScreen — password validation", () => {
  it("shows error when password is too short", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-password"), "Short1");
    fireEvent(screen.getByTestId("input-password"), "blur");
    await waitFor(() =>
      expect(screen.getByText("Minimum 8 characters")).toBeTruthy()
    );
  });

  it("shows error when password has no uppercase letter", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-password"), "lowercase1");
    fireEvent(screen.getByTestId("input-password"), "blur");
    await waitFor(() =>
      expect(screen.getByText("At least one uppercase letter")).toBeTruthy()
    );
  });

  it("shows error when password has no number", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-password"), "NoNumbers!");
    fireEvent(screen.getByTestId("input-password"), "blur");
    await waitFor(() =>
      expect(screen.getByText("At least one number")).toBeTruthy()
    );
  });

  it("renders the password strength meter when password is typed", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-password"), "Test1234");
    await waitFor(() =>
      expect(screen.getByTestId("password-strength")).toBeTruthy()
    );
  });

  it("toggles password visibility when the eye button is pressed", async () => {
    render(<SignUpScreen />);
    const input = screen.getByTestId("input-password");
    expect(input.props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByTestId("toggle-password"));
    await waitFor(() =>
      expect(screen.getByTestId("input-password").props.secureTextEntry).toBe(false)
    );
  });
});

// ─── Confirm password ─────────────────────────────────────────────────────────

describe("SignUpScreen — confirm password validation", () => {
  it("shows error when confirm password does not match", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-password"), "Password1");
    fireEvent.changeText(screen.getByTestId("input-confirm"), "Different1");
    fireEvent(screen.getByTestId("input-confirm"), "blur");
    await waitFor(() =>
      expect(screen.getByText("Passwords do not match")).toBeTruthy()
    );
  });

  it("shows no error when confirm password matches", async () => {
    render(<SignUpScreen />);
    fireEvent.changeText(screen.getByTestId("input-password"), "Password1");
    fireEvent.changeText(screen.getByTestId("input-confirm"), "Password1");
    fireEvent(screen.getByTestId("input-confirm"), "blur");
    await waitFor(() =>
      expect(screen.queryByText("Passwords do not match")).toBeNull()
    );
  });
});

// ─── Submit button state ──────────────────────────────────────────────────────

describe("SignUpScreen — submit button state", () => {
  it("is disabled when the form is empty", () => {
    render(<SignUpScreen />);
    expect(screen.getByTestId("btn-submit").props.accessibilityState?.disabled).toBe(true);
  });

  it("is disabled when username is taken", async () => {
    mockCheckUsername.mockResolvedValue(false);
    render(<SignUpScreen />);
    await fillValidForm();
    await waitFor(() =>
      expect(screen.getByTestId("btn-submit").props.accessibilityState?.disabled).toBe(true)
    );
  });

  it("is enabled only when the form is fully valid and username is available", async () => {
    render(<SignUpScreen />);
    await fillValidForm();
    await waitFor(() =>
      expect(screen.getByTestId("btn-submit").props.accessibilityState?.disabled).toBe(false)
    );
  });
});

// ─── Form submission ──────────────────────────────────────────────────────────

describe("SignUpScreen — form submission", () => {
  it("calls signUp with correct email, password, and username", async () => {
    render(<SignUpScreen />);
    await fillValidForm({
      username: "valid_user",
      email: "user@example.com",
      password: "Password1",
      confirm: "Password1",
    });

    await waitFor(() =>
      expect(screen.getByTestId("btn-submit").props.accessibilityState?.disabled).toBe(false)
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-submit"));
    });

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith(
        "user@example.com",
        "Password1",
        "valid_user"
      )
    );
  });

  it("shows the success view after a successful sign-up", async () => {
    render(<SignUpScreen />);
    await fillValidForm();

    await waitFor(() =>
      expect(screen.getByTestId("btn-submit").props.accessibilityState?.disabled).toBe(false)
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-submit"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("success-view")).toBeTruthy()
    );
    expect(screen.getByText("Check your email")).toBeTruthy();
  });

  it("success view navigates to sign-in when Go to Sign In is pressed", async () => {
    render(<SignUpScreen />);
    await fillValidForm();

    await waitFor(() =>
      expect(screen.getByTestId("btn-submit").props.accessibilityState?.disabled).toBe(false)
    );

    await act(async () => { fireEvent.press(screen.getByTestId("btn-submit")); });
    await waitFor(() => expect(screen.getByTestId("go-signin")).toBeTruthy());
    fireEvent.press(screen.getByTestId("go-signin"));
    expect(router.replace).toHaveBeenCalledWith("/(auth)/sign-in");
  });

  it("shows a submit error when signUp returns an error", async () => {
    mockSignUp.mockResolvedValue({ error: { message: "Email already in use" } });
    render(<SignUpScreen />);
    await fillValidForm();

    await waitFor(() =>
      expect(screen.getByTestId("btn-submit").props.accessibilityState?.disabled).toBe(false)
    );

    await act(async () => { fireEvent.press(screen.getByTestId("btn-submit")); });

    await waitFor(() =>
      expect(screen.getByTestId("submit-error")).toBeTruthy()
    );
    expect(screen.getByText("Email already in use")).toBeTruthy();
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe("SignUpScreen — navigation", () => {
  it("goes back when the back button is pressed", () => {
    render(<SignUpScreen />);
    fireEvent.press(screen.getByTestId("btn-back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("navigates to sign-in when the footer link is pressed", () => {
    render(<SignUpScreen />);
    fireEvent.press(screen.getByTestId("link-signin"));
    expect(router.replace).toHaveBeenCalledWith("/(auth)/sign-in");
  });
});
