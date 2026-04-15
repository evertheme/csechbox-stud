/**
 * ActionPanel component tests.
 *
 * Uses fake timers to test the turn countdown without actually waiting.
 */

import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react-native";
import { ActionPanel } from "../../components/game/ActionPanel";

// ─── Base props ───────────────────────────────────────────────────────────────

const BASE = {
  isMyTurn:  false,
  canCheck:  false,
  canCall:   false,
  canRaise:  false,
  callAmount: 0,
  onFold:       jest.fn(),
  onCheck:      jest.fn(),
  onCall:       jest.fn(),
  onOpenRaise:  jest.fn(),
  onTimeout:    jest.fn(),
};

function renderPanel(overrides: Partial<typeof BASE> = {}) {
  return render(<ActionPanel {...BASE} {...overrides} />);
}

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

// ─── Button rendering ─────────────────────────────────────────────────────────

describe("ActionPanel — button visibility", () => {
  it("always renders Fold button", () => {
    renderPanel();
    expect(screen.getByTestId("btn-fold")).toBeTruthy();
  });

  it("renders Check button only when canCheck=true", () => {
    renderPanel({ canCheck: true });
    expect(screen.getByTestId("btn-check")).toBeTruthy();
  });

  it("hides Check button when canCheck=false", () => {
    renderPanel({ canCheck: false });
    expect(screen.queryByTestId("btn-check")).toBeNull();
  });

  it("renders Call button only when canCall=true", () => {
    renderPanel({ canCall: true, callAmount: 20 });
    expect(screen.getByTestId("btn-call")).toBeTruthy();
  });

  it("hides Call button when canCall=false", () => {
    renderPanel({ canCall: false });
    expect(screen.queryByTestId("btn-call")).toBeNull();
  });

  it("shows call amount in Call button text", () => {
    renderPanel({ canCall: true, callAmount: 15 });
    expect(screen.getByText("Call $15")).toBeTruthy();
  });

  it("renders Raise button only when canRaise=true", () => {
    renderPanel({ canRaise: true });
    expect(screen.getByTestId("btn-raise")).toBeTruthy();
  });

  it("labels raise button 'Bet' when isRaise=false", () => {
    renderPanel({ canRaise: true, isRaise: false });
    expect(screen.getByText("Bet")).toBeTruthy();
  });

  it("labels raise button 'Raise' when isRaise=true", () => {
    renderPanel({ canRaise: true, isRaise: true });
    expect(screen.getByText("Raise")).toBeTruthy();
  });
});

// ─── Button disabled state ────────────────────────────────────────────────────

describe("ActionPanel — disabled when not my turn", () => {
  it("fold button is disabled when not my turn", () => {
    renderPanel({ isMyTurn: false });
    expect(screen.getByTestId("btn-fold").props.accessibilityState?.disabled).toBe(true);
  });

  it("check button is disabled when not my turn", () => {
    renderPanel({ isMyTurn: false, canCheck: true });
    expect(screen.getByTestId("btn-check").props.accessibilityState?.disabled).toBe(true);
  });

  it("call button is enabled when it IS my turn", () => {
    renderPanel({ isMyTurn: true, canCall: true, callAmount: 10 });
    expect(screen.getByTestId("btn-call").props.accessibilityState?.disabled).toBe(false);
  });
});

// ─── Callbacks ────────────────────────────────────────────────────────────────

describe("ActionPanel — callbacks", () => {
  it("calls onFold when Fold pressed (when my turn)", () => {
    const onFold = jest.fn();
    renderPanel({ isMyTurn: true, onFold });
    fireEvent.press(screen.getByTestId("btn-fold"));
    expect(onFold).toHaveBeenCalledTimes(1);
  });

  it("calls onCheck when Check pressed", () => {
    const onCheck = jest.fn();
    renderPanel({ isMyTurn: true, canCheck: true, onCheck });
    fireEvent.press(screen.getByTestId("btn-check"));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("calls onCall when Call pressed", () => {
    const onCall = jest.fn();
    renderPanel({ isMyTurn: true, canCall: true, callAmount: 10, onCall });
    fireEvent.press(screen.getByTestId("btn-call"));
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenRaise when Raise/Bet pressed", () => {
    const onOpenRaise = jest.fn();
    renderPanel({ isMyTurn: true, canRaise: true, onOpenRaise });
    fireEvent.press(screen.getByTestId("btn-raise"));
    expect(onOpenRaise).toHaveBeenCalledTimes(1);
  });
});

// ─── Timer ────────────────────────────────────────────────────────────────────

describe("ActionPanel — turn timer", () => {
  beforeEach(() => { jest.useFakeTimers(); });

  it("shows the timer bar and 'Your Turn' label when isMyTurn=true", () => {
    renderPanel({ isMyTurn: true });
    expect(screen.getByTestId("timer-track")).toBeTruthy();
    expect(screen.getByTestId("your-turn-label")).toBeTruthy();
  });

  it("hides timer when isMyTurn=false", () => {
    renderPanel({ isMyTurn: false });
    expect(screen.queryByTestId("timer-track")).toBeNull();
    expect(screen.queryByTestId("your-turn-label")).toBeNull();
  });

  it("shows initial full countdown", () => {
    renderPanel({ isMyTurn: true, timerSeconds: 30 });
    expect(screen.getByTestId("timer-seconds").props.children).toBe("30s");
  });

  it("counts down each second", async () => {
    renderPanel({ isMyTurn: true, timerSeconds: 30 });
    act(() => { jest.advanceTimersByTime(3000); });
    await waitFor(() => {
      const text = screen.getByTestId("timer-seconds").props.children as string;
      const secs = parseInt(text, 10);
      // Allow for slight variance from waitFor's internal polling
      expect(secs).toBeLessThanOrEqual(27);
      expect(secs).toBeGreaterThanOrEqual(25);
    });
  });

  it("calls onTimeout when countdown reaches 0", async () => {
    const onTimeout = jest.fn();
    renderPanel({ isMyTurn: true, timerSeconds: 5, onTimeout });
    act(() => { jest.advanceTimersByTime(5000); });
    await waitFor(() => expect(onTimeout).toHaveBeenCalledTimes(1));
  });

  it("resets timer when isMyTurn changes from false to true", async () => {
    const { rerender } = renderPanel({ isMyTurn: false, timerSeconds: 10 });
    act(() => { jest.advanceTimersByTime(3000); });

    rerender(
      <ActionPanel {...BASE} isMyTurn={true} timerSeconds={10} onTimeout={jest.fn()} />
    );
    await waitFor(() => {
      const text = screen.getByTestId("timer-seconds").props.children as string;
      const secs = parseInt(text, 10);
      expect(secs).toBeGreaterThanOrEqual(8);
    });
  });
});
