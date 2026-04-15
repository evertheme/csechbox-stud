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
  router: { back: jest.fn() },
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

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

import { Alert } from "react-native";
import { useAuthStore } from "../../store/auth-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AddChipsScreen, { CHIP_PACKAGES } from "../../app/(app)/add-chips";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_UPDATE_CHIPS = jest.fn();

function mockStore(chips = 1250) {
  jest.mocked(useAuthStore).mockReturnValue({
    chips,
    updateChips: MOCK_UPDATE_CHIPS,
  } as ReturnType<typeof useAuthStore>);
}

let alertSpy: jest.SpyInstance;

function pressAlertButton(label: string) {
  const calls = alertSpy.mock.calls;
  const last = calls[calls.length - 1];
  const buttons = (last?.[2] ?? []) as Array<{ text: string; onPress?: () => void }>;
  buttons.find((b) => b.text === label)?.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockStore();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.useRealTimers();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("AddChipsScreen — rendering", () => {
  it("renders the scroll view", () => {
    render(<AddChipsScreen />);
    expect(screen.getByTestId("add-chips-scroll")).toBeTruthy();
  });

  it("shows the current balance", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("balance-amount"));
    expect(screen.getByTestId("balance-amount").props.children).toBe("$1,250 chips");
  });

  it("renders all four chip package cards", () => {
    render(<AddChipsScreen />);
    for (const pkg of CHIP_PACKAGES) {
      expect(screen.getByTestId(`package-card-${pkg.id}`)).toBeTruthy();
    }
  });

  it("renders the daily claim card", async () => {
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("daily-claim-card"));
  });

  it("shows chip amounts on each card", () => {
    render(<AddChipsScreen />);
    expect(screen.getByTestId("chips-amount-small").props.children).toBe("500 Chips");
    expect(screen.getByTestId("chips-amount-medium").props.children).toBe("1,500 Chips");
    expect(screen.getByTestId("chips-amount-large").props.children).toBe("5,000 Chips");
    expect(screen.getByTestId("chips-amount-mega").props.children).toBe("15,000 Chips");
  });

  it("shows prices on each card", () => {
    render(<AddChipsScreen />);
    expect(screen.getByTestId("price-small").props.children).toBe("$4.99");
    expect(screen.getByTestId("price-medium").props.children).toBe("$9.99");
    expect(screen.getByTestId("price-large").props.children).toBe("$24.99");
    expect(screen.getByTestId("price-mega").props.children).toBe("$49.99");
  });

  it("shows bonus amounts on large and mega packages", () => {
    render(<AddChipsScreen />);
    expect(screen.getByTestId("bonus-amount-large").props.children).toBe("🎁 +500 Bonus");
    expect(screen.getByTestId("bonus-amount-mega").props.children).toBe("🎁 +2,000 Bonus");
  });

  it("does NOT show bonus on small or medium packages", () => {
    render(<AddChipsScreen />);
    expect(screen.queryByTestId("bonus-amount-small")).toBeNull();
    expect(screen.queryByTestId("bonus-amount-medium")).toBeNull();
  });

  it("shows POPULAR badge on medium package", () => {
    render(<AddChipsScreen />);
    expect(screen.getByTestId("badge-popular-medium")).toBeTruthy();
  });

  it("does NOT show POPULAR badge on other packages", () => {
    render(<AddChipsScreen />);
    expect(screen.queryByTestId("badge-popular-small")).toBeNull();
    expect(screen.queryByTestId("badge-popular-large")).toBeNull();
    expect(screen.queryByTestId("badge-popular-mega")).toBeNull();
  });

  it("shows BEST VALUE badge on mega package", () => {
    render(<AddChipsScreen />);
    expect(screen.getByTestId("badge-best-value-mega")).toBeTruthy();
  });

  it("does NOT show BEST VALUE badge on other packages", () => {
    render(<AddChipsScreen />);
    expect(screen.queryByTestId("badge-best-value-small")).toBeNull();
    expect(screen.queryByTestId("badge-best-value-medium")).toBeNull();
    expect(screen.queryByTestId("badge-best-value-large")).toBeNull();
  });
});

// ─── Package selection ────────────────────────────────────────────────────────

describe("AddChipsScreen — package selection", () => {
  it("purchase button is hidden before any package is selected", () => {
    render(<AddChipsScreen />);
    expect(screen.queryByTestId("btn-purchase")).toBeNull();
  });

  it("purchase button appears after selecting a package", () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    expect(screen.getByTestId("btn-purchase")).toBeTruthy();
  });

  it("deselects a package when pressing its Select button again", () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    fireEvent.press(screen.getByTestId("btn-select-small"));
    expect(screen.queryByTestId("btn-purchase")).toBeNull();
  });

  it("switches selection when a different package is pressed", () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    fireEvent.press(screen.getByTestId("btn-select-medium"));
    // Purchase button should still be present (medium now selected).
    expect(screen.getByTestId("btn-purchase")).toBeTruthy();
    // The small card's select button should show "Select" (not "✓ Selected").
    expect(screen.getByTestId("btn-select-small")).toBeTruthy();
    // getByText confirms only one "✓ Selected" label exists.
    expect(screen.getAllByText("✓ Selected")).toHaveLength(1);
  });

  it("pressing the card itself also selects the package", () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("package-card-large"));
    expect(screen.getByTestId("btn-purchase")).toBeTruthy();
  });
});

// ─── Purchase flow ────────────────────────────────────────────────────────────

describe("AddChipsScreen — purchase flow", () => {
  it("shows a confirmation Alert on Buy press", () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    fireEvent.press(screen.getByTestId("btn-purchase"));
    expect(alertSpy).toHaveBeenCalledWith(
      "Confirm Purchase",
      expect.stringContaining("$4.99"),
      expect.any(Array)
    );
  });

  it("does not call updateChips when Cancel is chosen", () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    fireEvent.press(screen.getByTestId("btn-purchase"));
    pressAlertButton("Cancel");
    expect(MOCK_UPDATE_CHIPS).not.toHaveBeenCalled();
  });

  it("calls updateChips with chips + current balance after confirming", async () => {
    // small: 500 chips, 0 bonus → total 500; current balance 1250
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    fireEvent.press(screen.getByTestId("btn-purchase"));
    act(() => { pressAlertButton("Pay $4.99"); });
    // Simulate the 1500ms internal setTimeout.
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(MOCK_UPDATE_CHIPS).toHaveBeenCalledWith(1250 + 500);
  });

  it("includes bonus chips in the total when confirming large package", async () => {
    // large: 5000 chips + 500 bonus = 5500 total
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-large"));
    fireEvent.press(screen.getByTestId("btn-purchase"));
    act(() => { pressAlertButton("Pay $24.99"); });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(MOCK_UPDATE_CHIPS).toHaveBeenCalledWith(1250 + 5500);
  });

  it("shows a success Alert after chips are added", async () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    fireEvent.press(screen.getByTestId("btn-purchase"));
    act(() => { pressAlertButton("Pay $4.99"); });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(alertSpy).toHaveBeenCalledWith(
      "Purchase Successful! 🎉",
      expect.stringContaining("chips have been added")
    );
  });

  it("deselects the package after a successful purchase", async () => {
    render(<AddChipsScreen />);
    fireEvent.press(screen.getByTestId("btn-select-small"));
    fireEvent.press(screen.getByTestId("btn-purchase"));
    act(() => { pressAlertButton("Pay $4.99"); });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(screen.queryByTestId("btn-purchase")).toBeNull();
  });
});

// ─── Daily free chips ─────────────────────────────────────────────────────────

describe("AddChipsScreen — daily free chips", () => {
  it("Claim button is enabled when no previous claim exists", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("btn-claim"));
    expect(
      screen.getByTestId("btn-claim").props.accessibilityState?.disabled
    ).toBe(false);
  });

  it("Claim button is disabled and shows countdown when within 24h cooldown", async () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000).toISOString();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(fiveHoursAgo);
    render(<AddChipsScreen />);
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-claim").props.accessibilityState?.disabled
      ).toBe(true)
    );
    expect(screen.getByTestId("daily-countdown")).toBeTruthy();
  });

  it("shows countdown text when on cooldown", async () => {
    // 5 hours ago → ~19h remaining
    const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000).toISOString();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(fiveHoursAgo);
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("daily-countdown"));
    const text = screen.getByTestId("daily-countdown").props.children as string;
    expect(text).toMatch(/next in:/i);
  });

  it("claims chips and saves timestamp on Claim press", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("btn-claim"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-claim"));
    });
    expect(jest.mocked(AsyncStorage.setItem)).toHaveBeenCalledWith(
      "poker_daily_chips_last_claim",
      expect.any(String)
    );
    expect(MOCK_UPDATE_CHIPS).toHaveBeenCalledWith(1250 + 100);
  });

  it("shows a success Alert after claiming", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("btn-claim"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-claim"));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Chips Claimed! 🎁",
      expect.stringContaining("100")
    );
  });

  it("disables Claim button immediately after claiming", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("btn-claim"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-claim"));
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-claim").props.accessibilityState?.disabled
      ).toBe(true)
    );
  });

  it("does not call updateChips when Claim is pressed on cooldown", async () => {
    const now = new Date().toISOString();
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(now);
    render(<AddChipsScreen />);
    await waitFor(() => screen.getByTestId("btn-claim"));
    fireEvent.press(screen.getByTestId("btn-claim"));
    expect(MOCK_UPDATE_CHIPS).not.toHaveBeenCalled();
  });
});

// ─── CHIP_PACKAGES constant ───────────────────────────────────────────────────

describe("CHIP_PACKAGES constant", () => {
  it("has exactly 4 packages", () => {
    expect(CHIP_PACKAGES).toHaveLength(4);
  });

  it("packages have correct chip amounts", () => {
    const amounts = CHIP_PACKAGES.map((p) => p.chips);
    expect(amounts).toEqual([500, 1_500, 5_000, 15_000]);
  });

  it("packages have correct prices", () => {
    const prices = CHIP_PACKAGES.map((p) => p.price);
    expect(prices).toEqual([4.99, 9.99, 24.99, 49.99]);
  });

  it("only medium is marked popular", () => {
    const popular = CHIP_PACKAGES.filter((p) => p.popular).map((p) => p.id);
    expect(popular).toEqual(["medium"]);
  });

  it("only mega is marked bestValue", () => {
    const best = CHIP_PACKAGES.filter((p) => p.bestValue).map((p) => p.id);
    expect(best).toEqual(["mega"]);
  });

  it("large has bonus 500", () => {
    const large = CHIP_PACKAGES.find((p) => p.id === "large");
    expect(large?.bonus).toBe(500);
  });

  it("mega has bonus 2000", () => {
    const mega = CHIP_PACKAGES.find((p) => p.id === "mega");
    expect(mega?.bonus).toBe(2_000);
  });
});
