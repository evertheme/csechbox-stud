/**
 * ChipAnimation tests.
 *
 * react-native-reanimated/mock stubs shared values and animation drivers.
 * withTiming completes asynchronously (via the mock scheduler), so we use
 * waitFor() when asserting the onComplete callback.
 *
 * SVG Text elements are queried via testID rather than screen.getByText,
 * because the RNTL renderer does not expose svg Text children as findable
 * text nodes.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { ChipAnimation } from "../../components/game/ChipAnimation";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FROM = { x: 0,   y: 0   };
const TO   = { x: 200, y: 100 };

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("ChipAnimation — rendering", () => {
  it("renders with default testID", () => {
    render(<ChipAnimation amount={25} from={FROM} to={TO} />);
    expect(screen.getByTestId("chip-animation")).toBeTruthy();
  });

  it("accepts a custom testID", () => {
    render(<ChipAnimation amount={25} from={FROM} to={TO} testID="my-chip" />);
    expect(screen.getByTestId("my-chip")).toBeTruthy();
  });

  it("renders without crashing for amount $1 (white tier)", () => {
    render(<ChipAnimation amount={1} from={FROM} to={TO} />);
    expect(screen.getByTestId("chip-animation")).toBeTruthy();
  });

  it("renders without crashing for amount $25 (red tier)", () => {
    render(<ChipAnimation amount={25} from={FROM} to={TO} />);
    expect(screen.getByTestId("chip-animation")).toBeTruthy();
  });

  it("renders without crashing for amount $100 (black tier)", () => {
    render(<ChipAnimation amount={100} from={FROM} to={TO} />);
    expect(screen.getByTestId("chip-animation")).toBeTruthy();
  });

  it("renders without crashing for large amounts ($5000)", () => {
    render(<ChipAnimation amount={5000} from={FROM} to={TO} />);
    expect(screen.getByTestId("chip-animation")).toBeTruthy();
  });

  it("renders when from and to are the same point", () => {
    render(<ChipAnimation amount={50} from={FROM} to={FROM} />);
    expect(screen.getByTestId("chip-animation")).toBeTruthy();
  });

  it("renders when moving in the negative direction", () => {
    render(
      <ChipAnimation amount={50} from={{ x: 300, y: 300 }} to={{ x: 50, y: 50 }} />
    );
    expect(screen.getByTestId("chip-animation")).toBeTruthy();
  });

  it("is absolutely positioned (position: absolute)", () => {
    render(<ChipAnimation amount={50} from={FROM} to={TO} />);
    const el    = screen.getByTestId("chip-animation");
    const style = [el.props.style].flat();
    const found = style.some(
      (s: Record<string, unknown>) => s && s.position === "absolute"
    );
    expect(found).toBe(true);
  });

  it("has pointerEvents none so it doesn't block interactions", () => {
    render(<ChipAnimation amount={50} from={FROM} to={TO} />);
    const el = screen.getByTestId("chip-animation");
    expect(el.props.pointerEvents).toBe("none");
  });
});

// ─── onComplete callback ──────────────────────────────────────────────────────

describe("ChipAnimation — onComplete", () => {
  it("eventually calls onComplete after the animation", async () => {
    const onComplete = jest.fn();
    render(<ChipAnimation amount={50} from={FROM} to={TO} onComplete={onComplete} />);
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("does NOT throw when onComplete is omitted", () => {
    expect(() => {
      render(<ChipAnimation amount={50} from={FROM} to={TO} />);
    }).not.toThrow();
  });

  it("calls onComplete only once per mount", async () => {
    const onComplete = jest.fn();
    render(<ChipAnimation amount={50} from={FROM} to={TO} onComplete={onComplete} />);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Give time for any potential spurious extra calls.
    await new Promise((r) => setTimeout(r, 50));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("calls a fresh onComplete for each mounted instance", async () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();

    const { unmount } = render(
      <ChipAnimation amount={50} from={FROM} to={TO} onComplete={cb1} />
    );
    await waitFor(() => expect(cb1).toHaveBeenCalledTimes(1));
    unmount();

    render(<ChipAnimation amount={50} from={FROM} to={TO} onComplete={cb2} />);
    await waitFor(() => expect(cb2).toHaveBeenCalledTimes(1));
  });
});

// ─── Chip colour tiers — label ────────────────────────────────────────────────
//
// The chip label is exposed as `accessibilityLabel` on the container view so
// tests don't need to peer inside SVG TSpan internals.

describe("ChipAnimation — chip label", () => {
  function getAccessLabel(testID = "chip-animation"): string {
    return screen.getByTestId(testID).props.accessibilityLabel as string;
  }

  it("shows $1 for amount 1 (white tier)", () => {
    render(<ChipAnimation amount={1} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$1");
  });

  it("shows $10 for amount 10 (white tier)", () => {
    render(<ChipAnimation amount={10} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$10");
  });

  it("shows $24 for amount 24 (white tier boundary)", () => {
    render(<ChipAnimation amount={24} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$24");
  });

  it("shows $25 for amount 25 (red tier start)", () => {
    render(<ChipAnimation amount={25} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$25");
  });

  it("shows $99 for amount 99 (red tier boundary)", () => {
    render(<ChipAnimation amount={99} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$99");
  });

  it("shows $100 for amount 100 (black tier start)", () => {
    render(<ChipAnimation amount={100} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$100");
  });

  it("shows $500 for amount 500 (black tier)", () => {
    render(<ChipAnimation amount={500} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$500");
  });

  it("abbreviates $1000 as $1k", () => {
    render(<ChipAnimation amount={1000} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$1k");
  });

  it("rounds $2500 to $3k", () => {
    render(<ChipAnimation amount={2500} from={FROM} to={TO} />);
    expect(getAccessLabel()).toBe("$3k");
  });

  it("reflects the custom testID chip's label", () => {
    render(
      <ChipAnimation amount={50} from={FROM} to={TO} testID="fancy-chip" />
    );
    expect(getAccessLabel("fancy-chip")).toBe("$50");
  });
});
