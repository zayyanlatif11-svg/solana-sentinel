import { describe, it, expect } from "vitest";
import { RiskEngine } from "@sat/risk-engine";
import {
  DEFAULT_RISK_CONFIG,
  getDemoCandidates,
  type OpportunityScore,
} from "@sat/shared";

const score = (n: number): OpportunityScore => ({
  mint: getDemoCandidates()[0]!.mint,
  compositeScore: n,
  components: {},
  weights: {},
  strategyConfigVersion: "strategy-v1",
  explanation: [],
  scoredAt: new Date().toISOString(),
});

describe("risk-engine", () => {
  it("rejects below min score", () => {
    const engine = new RiskEngine(DEFAULT_RISK_CONFIG);
    const asset = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const { result } = engine.evaluate(asset, {
      portfolio: {
        timestamp: new Date().toISOString(),
        navUsd: 100_000,
        cashUsd: 100_000,
        positionsValueUsd: 0,
        drawdownPct: 0,
        peakNavUsd: 100_000,
      },
      positions: [],
      requestedSizeUsd: 1000,
      score: score(10),
    });
    expect(result.decision).toBe("REJECT");
  });

  it("rejects when below capital floor", () => {
    const engine = new RiskEngine(DEFAULT_RISK_CONFIG);
    const asset = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const { result } = engine.evaluate(asset, {
      portfolio: {
        timestamp: new Date().toISOString(),
        navUsd: 1_000,
        cashUsd: 1_000,
        positionsValueUsd: 0,
        drawdownPct: 0,
        peakNavUsd: 1_000,
      },
      positions: [],
      requestedSizeUsd: 500,
      score: score(80),
    });
    expect(result.decision).toBe("REJECT");
    expect(result.reasons.join(" ")).toMatch(/floor/i);
  });

  it("rejects on max drawdown breach", () => {
    const engine = new RiskEngine(DEFAULT_RISK_CONFIG);
    const asset = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const { result } = engine.evaluate(asset, {
      portfolio: {
        timestamp: new Date().toISOString(),
        navUsd: 80_000,
        cashUsd: 80_000,
        positionsValueUsd: 0,
        drawdownPct: 0.25,
        peakNavUsd: 100_000,
      },
      positions: [],
      requestedSizeUsd: 1000,
      score: score(80),
    });
    expect(result.decision).toBe("REJECT");
  });

  it("reduces size for max position", () => {
    const engine = new RiskEngine(DEFAULT_RISK_CONFIG);
    const asset = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const { result } = engine.evaluate(asset, {
      portfolio: {
        timestamp: new Date().toISOString(),
        navUsd: 100_000,
        cashUsd: 100_000,
        positionsValueUsd: 0,
        drawdownPct: 0,
        peakNavUsd: 100_000,
      },
      positions: [],
      requestedSizeUsd: 50_000,
      score: score(80),
      estimatedPriceImpactPct: 0.2,
      slippageBps: 50,
    });
    expect(["APPROVE", "REDUCE_SIZE"]).toContain(result.decision);
    expect(result.approvedSizeUsd).toBeLessThanOrEqual(DEFAULT_RISK_CONFIG.maxPositionUsd);
  });
});
