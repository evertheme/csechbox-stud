/**
 * HandStrengthIndicator component tests.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { HandStrengthIndicator } from "../../components/game/HandStrengthIndicator";

describe("HandStrengthIndicator", () => {
  it("renders nothing when description is null", () => {
    const { toJSON } = render(
      <HandStrengthIndicator description={null} />
    );
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when visible=false", () => {
    const { toJSON } = render(
      <HandStrengthIndicator description="Pair of Kings" visible={false} />
    );
    expect(toJSON()).toBeNull();
  });

  it("renders the hand description text", () => {
    render(<HandStrengthIndicator description="Flush" />);
    expect(screen.getByTestId("hand-strength-text").props.children).toBe("Flush");
  });

  it("renders the Hand: label", () => {
    render(<HandStrengthIndicator description="Two Pair" />);
    expect(screen.getByText("Hand:")).toBeTruthy();
  });

  it("uses testID prop when provided", () => {
    render(<HandStrengthIndicator description="Straight" testID="my-hand" />);
    expect(screen.getByTestId("my-hand")).toBeTruthy();
  });

  it("applies gold colour for Royal Flush", () => {
    render(<HandStrengthIndicator description="Royal Flush" />);
    const text = screen.getByTestId("hand-strength-text");
    const flatStyle = [text.props.style].flat();
    expect(flatStyle).toContainEqual(expect.objectContaining({ color: "#ff6b00" }));
  });

  it("applies blue colour for Flush", () => {
    render(<HandStrengthIndicator description="Ace-High Flush" />);
    const text = screen.getByTestId("hand-strength-text");
    const flatStyle = [text.props.style].flat();
    expect(flatStyle).toContainEqual(expect.objectContaining({ color: "#3b82f6" }));
  });

  it("defaults to gray for unrecognised hands", () => {
    render(<HandStrengthIndicator description="Something Random" />);
    const text = screen.getByTestId("hand-strength-text");
    const flatStyle = [text.props.style].flat();
    expect(flatStyle).toContainEqual(expect.objectContaining({ color: "#94a3b8" }));
  });
});
