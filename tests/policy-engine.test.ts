import { describe, it, expect } from "vitest";
import { PolicyEngine } from "@sat/policy-engine";
import {
  DEFAULT_POLICY_CONFIG,
  getDemoCandidates,
  type CandidateAsset,
} from "@sat/shared";

function asset(partial: Partial<CandidateAsset> & Pick<CandidateAsset, "mint" | "symbol" | "name">): CandidateAsset {
  return {
    timestamp: new Date().toISOString(),
    priceUsd: 1,
    marketCapUsd: 1_000_000,
    liquidityUsd: 500_000,
    volume24hUsd: 100_000,
    volumeChange24hPct: 0,
    priceChange1hPct: 0,
    priceChange24hPct: 0,
    priceChange7dPct: 0,
    tokenAgeHours: 1000,
    holderCount: 1000,
    decimals: 6,
    metadata: {},
    dataSources: ["test"],
    riskFlags: [],
    isDemo: true,
    ...partial,
  };
}

describe("policy-engine", () => {
  it("rejects prohibited business keywords", () => {
    const engine = new PolicyEngine(DEFAULT_POLICY_CONFIG);
    const { assessment } = engine.evaluate(
      asset({
        mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        symbol: "BAD",
        name: "Casino Leverage Perp",
        metadata: { description: "interest bearing gambling" },
      }),
    );
    expect(assessment.decision).toBe("REJECTED");
    expect(assessment.reasons.join(" ")).toMatch(/Prohibited/i);
  });

  it("rejects blacklist", () => {
    const mint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
    const engine = new PolicyEngine({
      ...DEFAULT_POLICY_CONFIG,
      blacklistMints: [mint],
    });
    const { assessment } = engine.evaluate(
      asset({ mint, symbol: "JUP", name: "Jupiter" }),
    );
    expect(assessment.decision).toBe("REJECTED");
  });

  it("manual review on uncertain data", () => {
    const engine = new PolicyEngine(DEFAULT_POLICY_CONFIG);
    const { assessment } = engine.evaluate(
      asset({
        mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
        symbol: "JTO",
        name: "Jito",
        liquidityUsd: null,
        marketCapUsd: null,
      }),
    );
    expect(assessment.decision).toBe("MANUAL_REVIEW");
  });

  it("approves clean spot asset", () => {
    const demo = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const engine = new PolicyEngine(DEFAULT_POLICY_CONFIG);
    const { assessment } = engine.evaluate(demo);
    expect(assessment.decision).toBe("APPROVED");
  });
});
