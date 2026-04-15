/**
 * PlayerSeat component tests.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";
import { PlayerSeat } from "../../components/game/PlayerSeat";
import type { Card } from "../../types/poker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CARDS: Card[] = [
  { rank: "A", suit: "spades", faceUp: true  },
  { rank: "K", suit: "hearts", faceUp: false },
  { rank: "Q", suit: "diamonds", faceUp: true },
];

const BASE = {
  playerId:   "p1",
  username:   "Alice",
  chips:      1000,
  cards:      CARDS,
  currentBet: 0,
  isActive:   false,
  isFolded:   false,
};

function renderSeat(overrides: Partial<typeof BASE> = {}) {
  return render(<PlayerSeat {...BASE} {...overrides} />);
}

// ─── Basic rendering ──────────────────────────────────────────────────────────

describe("PlayerSeat — rendering", () => {
  it("renders the username", () => {
    renderSeat();
    expect(screen.getByTestId("username-p1").props.children).toBe("Alice");
  });

  it("renders the chip count", () => {
    renderSeat();
    expect(screen.getByText("$1,000")).toBeTruthy();
  });

  it("renders cards", () => {
    renderSeat();
    expect(screen.getByTestId("cards-p1")).toBeTruthy();
    // 3 cards in the hand
    expect(screen.getByTestId("seat-card-p1-0")).toBeTruthy();
    expect(screen.getByTestId("seat-card-p1-1")).toBeTruthy();
    expect(screen.getByTestId("seat-card-p1-2")).toBeTruthy();
  });

  it("does not show bet label when currentBet is 0", () => {
    renderSeat({ currentBet: 0 });
    expect(screen.queryByTestId("bet-p1")).toBeNull();
  });

  it("shows bet label when currentBet > 0", () => {
    renderSeat({ currentBet: 25 });
    expect(screen.getByText("Bet $25")).toBeTruthy();
  });
});

// ─── Dealer indicator ─────────────────────────────────────────────────────────

describe("PlayerSeat — dealer indicator", () => {
  it("shows dealer chip when isDealer=true", () => {
    renderSeat({ isDealer: true });
    expect(screen.getByTestId("dealer-p1")).toBeTruthy();
  });

  it("hides dealer chip by default", () => {
    renderSeat();
    expect(screen.queryByTestId("dealer-p1")).toBeNull();
  });
});

// ─── Active / glow ────────────────────────────────────────────────────────────

describe("PlayerSeat — active state", () => {
  it("renders glow ring when isActive and not folded", () => {
    renderSeat({ isActive: true, isFolded: false });
    expect(screen.getByTestId("glow-p1")).toBeTruthy();
  });

  it("does not render glow ring when not active", () => {
    renderSeat({ isActive: false });
    expect(screen.queryByTestId("glow-p1")).toBeNull();
  });

  it("does not render glow ring when active but folded", () => {
    renderSeat({ isActive: true, isFolded: true });
    expect(screen.queryByTestId("glow-p1")).toBeNull();
  });
});

// ─── Folded overlay ───────────────────────────────────────────────────────────

describe("PlayerSeat — folded overlay", () => {
  it("shows FOLDED overlay when isFolded=true", () => {
    renderSeat({ isFolded: true });
    expect(screen.getByTestId("folded-p1")).toBeTruthy();
  });

  it("does not show FOLDED overlay when not folded", () => {
    renderSeat({ isFolded: false });
    expect(screen.queryByTestId("folded-p1")).toBeNull();
  });
});

// ─── All-in overlay ───────────────────────────────────────────────────────────

describe("PlayerSeat — all-in overlay", () => {
  it("shows ALL IN overlay when isAllIn=true and not folded", () => {
    renderSeat({ isAllIn: true, isFolded: false });
    expect(screen.getByTestId("allin-p1")).toBeTruthy();
  });

  it("does not show ALL IN when isAllIn=true but folded", () => {
    renderSeat({ isAllIn: true, isFolded: true });
    expect(screen.queryByTestId("allin-p1")).toBeNull();
  });
});

// ─── Action label ─────────────────────────────────────────────────────────────

describe("PlayerSeat — action label", () => {
  it("shows action label badge when actionLabel is set", () => {
    renderSeat({ actionLabel: "Call $20" });
    expect(screen.getByTestId("action-label-p1")).toBeTruthy();
    expect(screen.getByText("Call $20")).toBeTruthy();
  });

  it("hides action label when null", () => {
    renderSeat({ actionLabel: null });
    expect(screen.queryByTestId("action-label-p1")).toBeNull();
  });
});

// ─── Long hands ───────────────────────────────────────────────────────────────

describe("PlayerSeat — card limits", () => {
  it("renders at most 5 cards even if more are passed", () => {
    const manyCards: Card[] = Array.from({ length: 8 }, (_, i) => ({
      rank: String(i + 2) as Card["rank"],
      suit: "clubs" as const,
      faceUp: true,
    }));
    renderSeat({ cards: manyCards });
    // Only 5 card testIDs should exist
    expect(screen.getByTestId("seat-card-p1-4")).toBeTruthy();
    expect(screen.queryByTestId("seat-card-p1-5")).toBeNull();
  });
});
