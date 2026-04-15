/**
 * RaiseSlider component tests.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { RaiseSlider } from "../../components/game/RaiseSlider";

// ─── Base props ───────────────────────────────────────────────────────────────

const BASE = {
  minBet:    10,
  maxBet:    500,
  pot:       100,
  onConfirm: jest.fn(),
  onCancel:  jest.fn(),
};

function renderSlider(overrides: Partial<typeof BASE & { isRaise?: boolean }> = {}) {
  return render(<RaiseSlider {...BASE} {...overrides} />);
}

afterEach(() => jest.clearAllMocks());

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("RaiseSlider — rendering", () => {
  it("renders with testID raise-slider", () => {
    renderSlider();
    expect(screen.getByTestId("raise-slider")).toBeTruthy();
  });

  it("shows title 'Bet Amount' when isRaise=false", () => {
    renderSlider({ isRaise: false });
    expect(screen.getByText("Bet Amount")).toBeTruthy();
  });

  it("shows title 'Raise to' when isRaise=true", () => {
    renderSlider({ isRaise: true });
    expect(screen.getByText("Raise to")).toBeTruthy();
  });

  it("renders all four preset buttons", () => {
    renderSlider();
    expect(screen.getByTestId("preset-min")).toBeTruthy();
    expect(screen.getByTestId("preset-½-pot")).toBeTruthy();
    expect(screen.getByTestId("preset-pot")).toBeTruthy();
    expect(screen.getByTestId("preset-all-in")).toBeTruthy();
  });

  it("shows min / max range hint", () => {
    renderSlider({ minBet: 10, maxBet: 500 });
    expect(screen.getByText(/Min \$10/)).toBeTruthy();
    expect(screen.getByText(/Max \$500/)).toBeTruthy();
  });
});

// ─── Preset buttons ───────────────────────────────────────────────────────────

describe("RaiseSlider — preset buttons", () => {
  it("Min preset sets input to minBet", () => {
    renderSlider({ minBet: 10 });
    fireEvent.press(screen.getByTestId("preset-min"));
    expect(screen.getByTestId("input-raise-amount").props.value).toBe("10");
  });

  it("All-In preset sets input to maxBet", () => {
    renderSlider({ maxBet: 500 });
    fireEvent.press(screen.getByTestId("preset-all-in"));
    expect(screen.getByTestId("input-raise-amount").props.value).toBe("500");
  });

  it("½ Pot preset sets input to half of pot (clamped to [min, max])", () => {
    renderSlider({ minBet: 10, maxBet: 500, pot: 100 });
    fireEvent.press(screen.getByTestId("preset-½-pot"));
    // pot/2 = 50, within [10, 500]
    expect(screen.getByTestId("input-raise-amount").props.value).toBe("50");
  });

  it("Pot preset sets input to pot value (clamped to max)", () => {
    renderSlider({ minBet: 10, maxBet: 500, pot: 100 });
    fireEvent.press(screen.getByTestId("preset-pot"));
    expect(screen.getByTestId("input-raise-amount").props.value).toBe("100");
  });

  it("Pot preset clamps to maxBet when pot > maxBet", () => {
    renderSlider({ minBet: 10, maxBet: 80, pot: 200 });
    fireEvent.press(screen.getByTestId("preset-pot"));
    expect(screen.getByTestId("input-raise-amount").props.value).toBe("80");
  });
});

// ─── Manual input ─────────────────────────────────────────────────────────────

describe("RaiseSlider — manual input", () => {
  it("updates confirm button text when valid amount typed", () => {
    renderSlider({ minBet: 10, maxBet: 500, isRaise: false });
    fireEvent.changeText(screen.getByTestId("input-raise-amount"), "150");
    expect(screen.getByText("Bet $150")).toBeTruthy();
  });

  it("disables confirm when amount < minBet", () => {
    renderSlider({ minBet: 10 });
    fireEvent.changeText(screen.getByTestId("input-raise-amount"), "5");
    expect(
      screen.getByTestId("btn-raise-confirm").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("disables confirm when amount > maxBet", () => {
    renderSlider({ maxBet: 500 });
    fireEvent.changeText(screen.getByTestId("input-raise-amount"), "9999");
    expect(
      screen.getByTestId("btn-raise-confirm").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("disables confirm for non-numeric input", () => {
    renderSlider();
    fireEvent.changeText(screen.getByTestId("input-raise-amount"), "abc");
    expect(
      screen.getByTestId("btn-raise-confirm").props.accessibilityState?.disabled
    ).toBe(true);
  });
});

// ─── Confirm / cancel ─────────────────────────────────────────────────────────

describe("RaiseSlider — confirm and cancel", () => {
  it("calls onConfirm with the entered amount when valid", () => {
    const onConfirm = jest.fn();
    renderSlider({ minBet: 10, maxBet: 500, onConfirm });
    fireEvent.changeText(screen.getByTestId("input-raise-amount"), "75");
    fireEvent.press(screen.getByTestId("btn-raise-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(75);
  });

  it("does NOT call onConfirm when amount is invalid", () => {
    const onConfirm = jest.fn();
    renderSlider({ minBet: 10, maxBet: 500, onConfirm });
    fireEvent.changeText(screen.getByTestId("input-raise-amount"), "3");
    fireEvent.press(screen.getByTestId("btn-raise-confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancel pressed", () => {
    const onCancel = jest.fn();
    renderSlider({ onCancel });
    fireEvent.press(screen.getByTestId("btn-raise-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
