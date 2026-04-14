import { HandEvaluator } from "../hand-evaluator.js";
import type { Card } from "@csechbox/shared-types";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

describe("HandEvaluator", () => {
  const evaluator = new HandEvaluator();

  it("detects royal flush", () => {
    const hole = [c("A", "spades"), c("K", "spades")];
    const community = [c("Q", "spades"), c("J", "spades"), c("10", "spades"), c("2", "hearts"), c("3", "clubs")];
    expect(evaluator.evaluate(hole, community).rank).toBe("royal-flush");
  });

  it("detects straight flush", () => {
    const hole = [c("9", "hearts"), c("8", "hearts")];
    const community = [c("7", "hearts"), c("6", "hearts"), c("5", "hearts"), c("A", "spades"), c("K", "clubs")];
    expect(evaluator.evaluate(hole, community).rank).toBe("straight-flush");
  });

  it("detects four of a kind", () => {
    const hole = [c("A", "spades"), c("A", "hearts")];
    const community = [c("A", "diamonds"), c("A", "clubs"), c("K", "spades"), c("2", "hearts"), c("3", "clubs")];
    expect(evaluator.evaluate(hole, community).rank).toBe("four-of-a-kind");
  });

  it("detects full house", () => {
    const hole = [c("K", "spades"), c("K", "hearts")];
    const community = [c("K", "diamonds"), c("Q", "clubs"), c("Q", "spades"), c("2", "hearts"), c("3", "clubs")];
    expect(evaluator.evaluate(hole, community).rank).toBe("full-house");
  });

  it("detects high card", () => {
    const hole = [c("2", "spades"), c("7", "hearts")];
    const community = [c("9", "diamonds"), c("J", "clubs"), c("K", "spades"), c("3", "hearts"), c("5", "clubs")];
    expect(evaluator.evaluate(hole, community).rank).toBe("high-card");
  });
});
