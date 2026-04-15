/**
 * Card component tests.
 *
 * react-native-svg elements are serialised to their tag names by the
 * jest-expo / jest-svg preset, so we query via testID on the wrapping
 * Animated.View and check child presence/absence through the rendered tree.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Card } from "../../components/game/Card";
import type { CardData } from "../../components/game/Card";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACE_SPADES:   CardData = { rank: "A",  suit: "spades"   };
const KING_HEARTS:  CardData = { rank: "K",  suit: "hearts"   };
const TEN_DIAMONDS: CardData = { rank: "10", suit: "diamonds" };
const TWO_CLUBS:    CardData = { rank: "2",  suit: "clubs"    };

// ─── Empty slot ───────────────────────────────────────────────────────────────

describe("Card — empty slot", () => {
  it("renders with testID card-empty when card is null", () => {
    render(<Card card={null} />);
    expect(screen.getByTestId("card-empty")).toBeTruthy();
  });

  it("accepts a custom testID", () => {
    render(<Card card={null} testID="my-slot" />);
    expect(screen.getByTestId("my-slot")).toBeTruthy();
  });

  it("renders at the correct default (medium) size", () => {
    render(<Card card={null} />);
    const el = screen.getByTestId("card-empty");
    const style = [el.props.style].flat();
    const merged = Object.assign({}, ...style);
    expect(merged).toMatchObject({ width: 60, height: 90 });
  });

  it("renders at small size", () => {
    render(<Card card={null} size="small" />);
    const el = screen.getByTestId("card-empty");
    const style = [el.props.style].flat();
    const merged = Object.assign({}, ...style);
    expect(merged).toMatchObject({ width: 40, height: 60 });
  });

  it("renders at large size", () => {
    render(<Card card={null} size="large" />);
    const el = screen.getByTestId("card-empty");
    const style = [el.props.style].flat();
    const merged = Object.assign({}, ...style);
    expect(merged).toMatchObject({ width: 80, height: 120 });
  });
});

// ─── Face-down (card back) ────────────────────────────────────────────────────

describe("Card — face down", () => {
  it("renders with testID card-back when faceUp=false", () => {
    render(<Card card={ACE_SPADES} faceUp={false} />);
    expect(screen.getByTestId("card-back")).toBeTruthy();
  });

  it("defaults faceUp to false when prop is omitted", () => {
    render(<Card card={ACE_SPADES} />);
    expect(screen.getByTestId("card-back")).toBeTruthy();
  });

  it("does NOT render the face testID when face-down", () => {
    render(<Card card={ACE_SPADES} faceUp={false} />);
    expect(screen.queryByTestId("card-A-spades")).toBeNull();
  });

  it("renders at all three sizes", () => {
    (["small", "medium", "large"] as const).forEach((size) => {
      const { unmount } = render(<Card card={ACE_SPADES} faceUp={false} size={size} />);
      expect(screen.getByTestId("card-back")).toBeTruthy();
      unmount();
    });
  });
});

// ─── Face-up ──────────────────────────────────────────────────────────────────

describe("Card — face up", () => {
  it("renders with compound testID card-{rank}-{suit}", () => {
    render(<Card card={ACE_SPADES} faceUp />);
    expect(screen.getByTestId("card-A-spades")).toBeTruthy();
  });

  it("renders all four suits without error", () => {
    const suits = [ACE_SPADES, KING_HEARTS, TEN_DIAMONDS, TWO_CLUBS] as const;
    suits.forEach((c) => {
      const { unmount } = render(<Card card={c} faceUp />);
      expect(screen.getByTestId(`card-${c.rank}-${c.suit}`)).toBeTruthy();
      unmount();
    });
  });

  it("renders at all three sizes", () => {
    (["small", "medium", "large"] as const).forEach((size) => {
      const { unmount } = render(<Card card={ACE_SPADES} faceUp size={size} />);
      expect(screen.getByTestId("card-A-spades")).toBeTruthy();
      unmount();
    });
  });

  it("does NOT render card-back testID when face-up", () => {
    render(<Card card={ACE_SPADES} faceUp />);
    expect(screen.queryByTestId("card-back")).toBeNull();
  });
});

// ─── Highlighted ──────────────────────────────────────────────────────────────

describe("Card — highlighted", () => {
  it("renders without error when highlighted=true (face-up)", () => {
    render(<Card card={ACE_SPADES} faceUp highlighted />);
    expect(screen.getByTestId("card-A-spades")).toBeTruthy();
  });

  it("renders without error when highlighted=true (face-down)", () => {
    render(<Card card={ACE_SPADES} faceUp={false} highlighted />);
    expect(screen.getByTestId("card-back")).toBeTruthy();
  });

  it("renders without error when highlighted=true (empty slot)", () => {
    render(<Card card={null} highlighted />);
    expect(screen.getByTestId("card-empty")).toBeTruthy();
  });
});

// ─── Interactive / press ──────────────────────────────────────────────────────

describe("Card — interactive", () => {
  it("renders a pressable wrapper when onPress is provided", () => {
    const onPress = jest.fn();
    render(<Card card={ACE_SPADES} faceUp onPress={onPress} />);
    expect(screen.getByTestId("card-A-spades-btn")).toBeTruthy();
  });

  it("calls onPress when the card is pressed", () => {
    const onPress = jest.fn();
    render(<Card card={ACE_SPADES} faceUp onPress={onPress} />);
    fireEvent.press(screen.getByTestId("card-A-spades-btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does NOT render the -btn wrapper when onPress is absent", () => {
    render(<Card card={ACE_SPADES} faceUp />);
    expect(screen.queryByTestId("card-A-spades-btn")).toBeNull();
  });

  it("allows pressing face-down card", () => {
    const onPress = jest.fn();
    render(<Card card={ACE_SPADES} faceUp={false} onPress={onPress} />);
    fireEvent.press(screen.getByTestId("card-back-btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("allows pressing empty slot", () => {
    const onPress = jest.fn();
    render(<Card card={null} onPress={onPress} />);
    fireEvent.press(screen.getByTestId("card-empty-btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// ─── Custom testID propagation ────────────────────────────────────────────────

describe("Card — custom testID", () => {
  it("uses custom testID for the card view", () => {
    render(<Card card={ACE_SPADES} faceUp testID="featured-card" />);
    expect(screen.getByTestId("featured-card")).toBeTruthy();
  });

  it("appends -btn suffix to custom testID when pressable", () => {
    render(<Card card={ACE_SPADES} faceUp testID="featured-card" onPress={jest.fn()} />);
    expect(screen.getByTestId("featured-card-btn")).toBeTruthy();
  });
});

// ─── Snapshot smoke tests ─────────────────────────────────────────────────────

describe("Card — snapshot", () => {
  it("empty slot matches snapshot", () => {
    const { toJSON } = render(<Card card={null} size="medium" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("face-down medium card matches snapshot", () => {
    const { toJSON } = render(<Card card={ACE_SPADES} faceUp={false} size="medium" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("face-up Ace of Spades matches snapshot", () => {
    const { toJSON } = render(<Card card={ACE_SPADES} faceUp size="medium" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("face-up King of Hearts highlighted matches snapshot", () => {
    const { toJSON } = render(
      <Card card={KING_HEARTS} faceUp highlighted size="medium" />
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
