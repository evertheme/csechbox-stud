import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("../../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { router } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import ForgotPasswordScreen from "../../app/(auth)/forgot-password";

const mockResetPassword = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockResetPassword.mockResolvedValue({ error: null });
  jest.mocked(useAuth).mockReturnValue({ resetPassword: mockResetPassword } as any);
});

describe("ForgotPasswordScreen", () => {
  it("renders the email field and submit button", () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(screen.getByText("Send Reset Link")).toBeTruthy();
  });

  it("shows an error when submitting with an empty email", async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText("Send Reset Link"));
    await waitFor(() =>
      expect(screen.getByText("Please enter your email address.")).toBeTruthy()
    );
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("calls resetPassword with trimmed email on submit", async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "  user@example.com  "
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Send Reset Link"));
    });
    await waitFor(() =>
      expect(mockResetPassword).toHaveBeenCalledWith("user@example.com")
    );
  });

  it("shows the success screen after a successful reset request", async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "user@example.com"
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Send Reset Link"));
    });
    await waitFor(() => expect(screen.getByText("Reset link sent")).toBeTruthy());
    expect(screen.getByText("user@example.com")).toBeTruthy();
  });

  it("success screen navigates to sign-in when Back to Sign In is pressed", async () => {
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "user@example.com"
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Send Reset Link"));
    });
    await waitFor(() => expect(screen.getByText("Back to Sign In")).toBeTruthy());
    fireEvent.press(screen.getByText("Back to Sign In"));
    expect(router.replace).toHaveBeenCalledWith("/(auth)/sign-in");
  });

  it("displays the error returned by resetPassword on failure", async () => {
    mockResetPassword.mockResolvedValue({ error: { message: "Email not found" } });
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText("you@example.com"),
      "nobody@example.com"
    );
    await act(async () => {
      fireEvent.press(screen.getByText("Send Reset Link"));
    });
    await waitFor(() =>
      expect(screen.getByText("Email not found")).toBeTruthy()
    );
  });

  it("goes back when the back button is pressed", () => {
    render(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText("← Back"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
