import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabaseForTests } from "@sat/database";
import {
  runFullResearchPass,
  evaluateMint,
  executePaperProposal,
  runDemoExperiment,
  getOperatingMode,
} from "@sat/pipeline";
import { getDemoCandidates } from "@sat/shared";

describe("pipeline e2e (demo)", () => {
  beforeEach(() => {
    resetDatabaseForTests(100_000);
  });

  it("runs research pass and rejects scam token", async () => {
    const proposals = await runFullResearchPass();
    expect(proposals.length).toBeGreaterThan(0);
    const scam = proposals.find((p) => p.symbol === "SCAMX");
    expect(scam).toBeTruthy();
    expect(scam!.status).toBe("REJECTED");
    expect(
      scam!.policy.decision === "REJECTED" ||
        scam!.tokenRisk.riskTier === "HIGH_RISK" ||
        scam!.risk.decision === "REJECT",
    ).toBe(true);
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
        p.risk.decision !== "REJECT",
    );
    expect(ok).toBeTruthy();
    const result = await executePaperProposal(ok!.id);
    expect(result.plan.canBroadcast).toBe(false);
    expect(["FILLED", "PARTIAL", "FAILED", "STALE_REJECTED"]).toContain(result.order.status);
  });

  it("runs experiment with sample warnings possible", () => {
    const exp = runDemoExperiment();
    expect(exp.baselines.solBuyHold).toBeTruthy();
    expect(exp.notes.join(" ")).toMatch(/not live/i);
  });

  it("forces non-live operating mode", () => {
    process.env.OPERATING_MODE = "LIVE";
    expect(getOperatingMode()).toBe("PAPER");
    process.env.OPERATING_MODE = "PAPER";
  });
});
