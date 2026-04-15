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
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
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

jest.mock("../../store/settings-store", () => ({
  useSettingsStore: jest.fn(),
}));


// Mock fetch for delete-account calls.
global.fetch = jest.fn();

import { Alert, Linking } from "react-native";

// Spy references — assigned in beforeEach so they survive clearAllMocks.
let mockAlertAlert: jest.SpyInstance;
let mockLinkingOpenURL: jest.SpyInstance;
import { router } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import { useSettingsStore } from "../../store/settings-store";
import SettingsScreen from "../../app/(app)/settings";

// ─── Default mock values ─────────────────────────────────────────────────────

const DEFAULT_AUTH = {
  user: { id: "u1", email: "ace@poker.com" },
  session: { access_token: "tok-abc" },
  signOut: jest.fn().mockResolvedValue(undefined),
};

const DEFAULT_SETTINGS = {
  soundEffects: true,
  music: true,
  vibration: false,
  autoMuckLosing: true,
  showHandStrength: true,
  animationSpeed: "normal" as const,
  theme: "dark" as const,
  cardStyle: "classic" as const,
  tableColor: "green" as const,
  setSoundEffects: jest.fn(),
  setMusic: jest.fn(),
  setVibration: jest.fn(),
  setAutoMuckLosing: jest.fn(),
  setShowHandStrength: jest.fn(),
  setAnimationSpeed: jest.fn(),
  setTheme: jest.fn(),
  setCardStyle: jest.fn(),
  setTableColor: jest.fn(),
};

function mockStores(authOverrides = {}, settingsOverrides = {}) {
  jest.mocked(useAuthStore).mockReturnValue({
    ...DEFAULT_AUTH,
    ...authOverrides,
  } as ReturnType<typeof useAuthStore>);
  jest.mocked(useSettingsStore).mockReturnValue({
    ...DEFAULT_SETTINGS,
    ...settingsOverrides,
  } as ReturnType<typeof useSettingsStore>);
}

// Helper to capture and invoke the Alert callback for a given button label.
function pressAlertButton(label: string) {
  const calls = mockAlertAlert.mock.calls;
  const last = calls[calls.length - 1];
  const buttons = last?.[2] ?? [];
  const btn = buttons.find((b) => b.text === label);
  btn?.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStores();
  // Spy on Alert.alert and Linking.openURL fresh each test.
  mockAlertAlert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockLinkingOpenURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({}),
  } as unknown as Response);
});

afterEach(() => {
  mockAlertAlert?.mockRestore();
  mockLinkingOpenURL?.mockRestore();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("SettingsScreen — rendering", () => {
  it("renders the SectionList", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("settings-list")).toBeTruthy();
  });

  it("renders all section rows for Account", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("row-change-password")).toBeTruthy();
    expect(screen.getByTestId("row-email-notifications")).toBeTruthy();
    expect(screen.getByTestId("row-privacy-settings")).toBeTruthy();
  });

  it("renders all toggle rows for Game Preferences", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("toggle-sound-effects")).toBeTruthy();
    expect(screen.getByTestId("toggle-music")).toBeTruthy();
    expect(screen.getByTestId("toggle-vibration")).toBeTruthy();
    expect(screen.getByTestId("toggle-auto-muck")).toBeTruthy();
    expect(screen.getByTestId("toggle-hand-strength")).toBeTruthy();
  });

  it("renders account email in the footer", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("account-email").props.children).toBe(
      "ace@poker.com"
    );
  });

  it("renders Sign Out button", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("btn-sign-out")).toBeTruthy();
  });

  it("renders version info row", () => {
    render(<SettingsScreen />);
    expect(screen.getByTestId("row-version")).toBeTruthy();
  });
});

// ─── Toggle switches ──────────────────────────────────────────────────────────

describe("SettingsScreen — toggle switches", () => {
  it("reflects soundEffects value from settings store", () => {
    mockStores({}, { soundEffects: false });
    render(<SettingsScreen />);
    expect(
      screen.getByTestId("toggle-sound-effects").props.value
    ).toBe(false);
  });

  it("calls setSoundEffects when sound toggle is changed", () => {
    const setSoundEffects = jest.fn();
    mockStores({}, { setSoundEffects });
    render(<SettingsScreen />);
    fireEvent(screen.getByTestId("toggle-sound-effects"), "valueChange", false);
    expect(setSoundEffects).toHaveBeenCalledWith(false);
  });

  it("calls setMusic when music toggle is changed", () => {
    const setMusic = jest.fn();
    mockStores({}, { setMusic });
    render(<SettingsScreen />);
    fireEvent(screen.getByTestId("toggle-music"), "valueChange", false);
    expect(setMusic).toHaveBeenCalledWith(false);
  });

  it("calls setVibration when vibration toggle is changed", () => {
    const setVibration = jest.fn();
    mockStores({}, { setVibration });
    render(<SettingsScreen />);
    fireEvent(screen.getByTestId("toggle-vibration"), "valueChange", true);
    expect(setVibration).toHaveBeenCalledWith(true);
  });

  it("calls setAutoMuckLosing when auto-muck toggle is changed", () => {
    const setAutoMuckLosing = jest.fn();
    mockStores({}, { setAutoMuckLosing });
    render(<SettingsScreen />);
    fireEvent(screen.getByTestId("toggle-auto-muck"), "valueChange", false);
    expect(setAutoMuckLosing).toHaveBeenCalledWith(false);
  });

  it("calls setShowHandStrength when hand-strength toggle is changed", () => {
    const setShowHandStrength = jest.fn();
    mockStores({}, { setShowHandStrength });
    render(<SettingsScreen />);
    fireEvent(screen.getByTestId("toggle-hand-strength"), "valueChange", false);
    expect(setShowHandStrength).toHaveBeenCalledWith(false);
  });
});

// ─── Navigation rows ──────────────────────────────────────────────────────────

describe("SettingsScreen — navigation rows", () => {
  it("navigates to change-password screen", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-change-password"));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith(
      "/(app)/change-password"
    );
  });

  it("navigates to email-notifications screen", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-email-notifications"));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith(
      "/(app)/email-notifications"
    );
  });

  it("navigates to privacy-settings screen", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-privacy-settings"));
    expect(jest.mocked(router.push)).toHaveBeenCalledWith(
      "/(app)/privacy-settings"
    );
  });

  it("opens a mailto link for Contact Support", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-contact-support"));
    expect(mockLinkingOpenURL).toHaveBeenCalledWith(
      "mailto:support@csechbox.com"
    );
  });

  it("opens a mailto link for Report a Bug", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-report-bug"));
    expect(mockLinkingOpenURL).toHaveBeenCalledWith(
      expect.stringContaining("mailto:bugs@csechbox.com")
    );
  });

  it("opens Terms of Service URL", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-terms"));
    expect(mockLinkingOpenURL).toHaveBeenCalledWith(
      "https://csechbox.com/terms"
    );
  });

  it("opens Privacy Policy URL", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-privacy-policy"));
    expect(mockLinkingOpenURL).toHaveBeenCalledWith(
      "https://csechbox.com/privacy"
    );
  });
});

// ─── Animation speed picker ───────────────────────────────────────────────────

describe("SettingsScreen — animation speed picker", () => {
  it("shows Alert picker when animation-speed row is pressed", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-animation-speed"));
    expect(mockAlertAlert).toHaveBeenCalledWith(
      "Animation Speed",
      expect.any(String),
      expect.any(Array)
    );
  });

  it("calls setAnimationSpeed when a speed option is selected", () => {
    const setAnimationSpeed = jest.fn();
    mockStores({}, { setAnimationSpeed });
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-animation-speed"));
    pressAlertButton("Fast");
    expect(setAnimationSpeed).toHaveBeenCalledWith("fast");
  });
});

// ─── Theme picker ─────────────────────────────────────────────────────────────

describe("SettingsScreen — theme picker", () => {
  it("shows Alert picker when theme row is pressed", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-theme"));
    expect(mockAlertAlert).toHaveBeenCalledWith(
      "Theme",
      expect.any(String),
      expect.any(Array)
    );
  });

  it("calls setTheme with 'light' when Light option is selected", () => {
    const setTheme = jest.fn();
    mockStores({}, { setTheme });
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-theme"));
    pressAlertButton("Light");
    expect(setTheme).toHaveBeenCalledWith("light");
  });
});

// ─── Sign Out ─────────────────────────────────────────────────────────────────

describe("SettingsScreen — Sign Out", () => {
  it("shows a confirmation alert when Sign Out is pressed", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("btn-sign-out"));
    expect(mockAlertAlert).toHaveBeenCalledWith(
      "Sign Out",
      expect.any(String),
      expect.any(Array),
      expect.any(Object)
    );
  });

  it("does not call signOut when 'Cancel' is chosen", () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockStores({ signOut });
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("btn-sign-out"));
    pressAlertButton("Cancel");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("calls signOut when 'Sign Out' is confirmed", async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockStores({ signOut });
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("btn-sign-out"));
    await act(async () => { pressAlertButton("Sign Out"); });
    expect(signOut).toHaveBeenCalled();
  });
});

// ─── Delete Account ───────────────────────────────────────────────────────────

describe("SettingsScreen — Delete Account", () => {
  it("shows a warning alert when Delete Account row is pressed", () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-delete-account"));
    expect(mockAlertAlert).toHaveBeenCalledWith(
      "Delete Account",
      expect.any(String),
      expect.any(Array)
    );
  });

  it("shows the delete modal after confirming the first alert", async () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-delete-account"));
    act(() => { pressAlertButton("Continue"); });
    await waitFor(() => screen.getByTestId("delete-modal"));
  });

  it("hides the delete modal when Cancel is pressed inside it", async () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-delete-account"));
    act(() => { pressAlertButton("Continue"); });
    await waitFor(() => screen.getByTestId("delete-modal"));
    fireEvent.press(screen.getByTestId("btn-delete-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("delete-modal")).toBeNull()
    );
  });

  it("shows an error when password is empty and Confirm is pressed", async () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-delete-account"));
    act(() => { pressAlertButton("Continue"); });
    await waitFor(() => screen.getByTestId("btn-delete-confirm"));
    // Don't fill password — press Confirm.
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-delete-confirm"));
    });
    await waitFor(() => screen.getByTestId("delete-error"));
    expect(screen.getByTestId("delete-error").props.children).toMatch(
      /password/i
    );
  });

  it("calls DELETE /api/users/me with password when Confirm is pressed", async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockStores({ signOut });
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-delete-account"));
    act(() => { pressAlertButton("Continue"); });
    await waitFor(() => screen.getByTestId("input-delete-password"));
    fireEvent.changeText(
      screen.getByTestId("input-delete-password"),
      "mySecret123"
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-delete-confirm"));
    });
    expect(jest.mocked(global.fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/me"),
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ password: "mySecret123" }),
      })
    );
  });

  it("calls signOut after a successful account deletion", async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockStores({ signOut });
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-delete-account"));
    act(() => { pressAlertButton("Continue"); });
    await waitFor(() => screen.getByTestId("input-delete-password"));
    fireEvent.changeText(
      screen.getByTestId("input-delete-password"),
      "mySecret123"
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-delete-confirm"));
    });
    expect(signOut).toHaveBeenCalled();
  });

  it("shows an error message when DELETE fails", async () => {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ message: "Wrong password" }),
    } as unknown as Response);
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId("row-delete-account"));
    act(() => { pressAlertButton("Continue"); });
    await waitFor(() => screen.getByTestId("input-delete-password"));
    fireEvent.changeText(
      screen.getByTestId("input-delete-password"),
      "wrongpassword"
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-delete-confirm"));
    });
    await waitFor(() => screen.getByTestId("delete-error"));
    expect(screen.getByTestId("delete-error").props.children).toMatch(
      /wrong password/i
    );
  });
});
