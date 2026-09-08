import { describe, it, expect } from "vitest";
import { assessTokenRisk } from "@sat/token-risk";
import { getDemoCandidates } from "@sat/shared";

describe("token-risk", () => {
  it("never returns SAFE tier", () => {
    const asset = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const a = assessTokenRisk(asset, {
      tokenProgram: "TOKEN",
      mintAuthority: false,
      freezeAuthority: false,
      permanentDelegate: false,
      transferRestrictions: false,
      topHolderConcentrationPct: 20,
      exitLiquidityUsd: 5_000_000,
      estimatedPriceImpactPct: 0.2,
      metadataQuality: 0.9,
    });
    expect(a.riskTier).not.toBe("SAFE" as never);
    expect(["LOWER_RISK", "ELEVATED_RISK", "HIGH_RISK", "INSUFFICIENT_DATA"]).toContain(
      a.riskTier,
    );
  });

  it("flags high-risk scam-like token", () => {
    const asset = getDemoCandidates().find((c) => c.symbol === "SCAMX")!;
    const a = assessTokenRisk(asset, {
      tokenProgram: "TOKEN_2022",
      mintAuthority: true,
      freezeAuthority: true,
      permanentDelegate: true,
      transferRestrictions: true,
      topHolderConcentrationPct: 92,
      exitLiquidityUsd: 3000,
      estimatedPriceImpactPct: 18,
      metadataQuality: 0.2,
    });
    expect(a.riskScore).toBeGreaterThanOrEqual(70);
    expect(a.riskTier).toBe("HIGH_RISK");
    expect(a.riskFlags.length).toBeGreaterThan(3);
  });

  it("returns INSUFFICIENT_DATA when confidence low", () => {
    const asset = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const a = assessTokenRisk(
      { ...asset, liquidityUsd: null, tokenAgeHours: null, holderCount: null },
      {},
    );
    expect(a.riskTier).toBe("INSUFFICIENT_DATA");
    expect(a.details.missingFields.length).toBeGreaterThan(0);
  });
});
