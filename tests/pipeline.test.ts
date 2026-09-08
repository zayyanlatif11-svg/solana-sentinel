import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabaseForTests } from "@sat/database";
import {
  runFullResearchPass,
  evaluateMint,
  executePaperProposal,
  runDemoExperiment,
  getOperatingMode,
  resetProvidersForTests,
} from "@sat/pipeline";
import { getDemoCandidates } from "@sat/shared";

describe("pipeline e2e (demo)", () => {
  beforeEach(() => {
    resetDatabaseForTests(100_000);
    resetProvidersForTests();
    process.env.PAPER_FAIL_PROBABILITY = "0";
    process.env.PAPER_PARTIAL_PROBABILITY = "0";
  });

  it("runs research pass and rejects scam token", async () => {
    const proposals = await runFullResearchPass();
    expect(proposals.length).toBeGreaterThan(0);
    const scam = proposals.find((p) => p.symbol === "SCAMX");
    expect(scam).toBeTruthy();
    expect(scam!.status).toBe("REJECTED");
    expect(scam!.policy.decision).toBe("REJECTED");
    expect(scam!.tokenRisk.riskTier).toBe("HIGH_RISK");
    expect(scam!.risk.decision).toBe("REJECT");
  });

  it("suppresses duplicate proposals", async () => {
    const jup = getDemoCandidates().find((c) => c.symbol === "JUP")!;
    const a = await evaluateMint(jup.mint);
    const b = await evaluateMint(jup.mint);
    expect(a?.id).toBe(b?.id);
  });

  it("paper executes approved proposal without broadcast", async () => {
    const proposals = await runFullResearchPass();
    const ok = proposals.find(
      (p) =>
        p.status === "PROPOSED" &&
        p.policy.decision === "APPROVED" &&
        p.risk.decision !== "REJECT" &&
        p.tokenRisk.riskTier !== "HIGH_RISK" &&
        p.tokenRisk.riskTier !== "INSUFFICIENT_DATA",
    );
    expect(ok).toBeTruthy();
    const result = await executePaperProposal(ok!.id);
    expect(["FILLED", "PARTIAL"]).toContain(result.order.status);
    expect(result.plan.canBroadcast).toBe(false);
    expect(result.plan.mode).toBe("PAPER");
    expect(result.order.filledUsd).toBeGreaterThan(0);
    await expect(executePaperProposal(ok!.id)).rejects.toThrow(/already paper-executed/i);
  });

  it("blocks paper execute in READ_ONLY mode", async () => {
    const prev = process.env.OPERATING_MODE;
    process.env.OPERATING_MODE = "READ_ONLY";
    try {
      const proposals = await runFullResearchPass();
      const ok = proposals.find(
        (p) =>
          p.status === "PROPOSED" &&
          p.policy.decision === "APPROVED" &&
          p.risk.decision !== "REJECT" &&
          p.tokenRisk.riskTier !== "HIGH_RISK" &&
          p.tokenRisk.riskTier !== "INSUFFICIENT_DATA",
      );
      expect(ok).toBeTruthy();
      await expect(executePaperProposal(ok!.id)).rejects.toThrow(/READ_ONLY/i);
    } finally {
      if (prev === undefined) delete process.env.OPERATING_MODE;
      else process.env.OPERATING_MODE = prev;
    }
  });

  it("runs experiment without inventing synthetic equity", async () => {
    const exp = await runDemoExperiment();
    expect(exp.dataQuality).toBe("INSUFFICIENT_HISTORY");
    expect(exp.strategyMetrics).toBeNull();
    expect(exp.notes.join(" ")).toMatch(/INSUFFICIENT HISTORY/i);
    expect(exp.notes.join(" ")).toMatch(/not live|DEMO DATA/i);
  });

  it("forces non-live operating mode", () => {
    process.env.OPERATING_MODE = "LIVE";
    expect(getOperatingMode()).toBe("PAPER");
    process.env.OPERATING_MODE = "PAPER";
  });
});
