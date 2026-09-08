import {
  type TradeProposal,
  type PolicyAssessment,
  type TokenRiskAssessment,
  type RiskEngineResult,
  PROPOSAL_TTL_MS,
} from "@sat/shared";

export function decideProposalStatus(input: {
  policy: PolicyAssessment;
  tokenRisk: TokenRiskAssessment;
  risk: RiskEngineResult;
}): TradeProposal["status"] {
  if (input.policy.decision === "REJECTED") return "REJECTED";
  if (input.policy.decision === "MANUAL_REVIEW") return "MANUAL_REVIEW";
  if (input.risk.decision === "REJECT") return "REJECTED";
  if (
    input.tokenRisk.riskTier === "HIGH_RISK" ||
    input.tokenRisk.riskTier === "INSUFFICIENT_DATA"
  ) {
    return "REJECTED";
  }
  return "PROPOSED";
}

export function assertStoredGates(proposal: TradeProposal): void {
  if (proposal.status === "REJECTED") throw new Error("Cannot execute rejected proposal");
  if (proposal.status === "MANUAL_REVIEW")
    throw new Error("MANUAL_REVIEW — paper execution blocked");
  if (proposal.status === "ACCEPTED_PAPER")
    throw new Error("Proposal already paper-executed");
  if (proposal.policy.decision !== "APPROVED")
    throw new Error("Policy not APPROVED — paper execution blocked");
  if (proposal.risk.decision === "REJECT")
    throw new Error("Risk REJECT — paper execution blocked");
  if (
    proposal.tokenRisk.riskTier === "HIGH_RISK" ||
    proposal.tokenRisk.riskTier === "INSUFFICIENT_DATA"
  ) {
    throw new Error("Token-risk gate — paper execution blocked");
  }
}

export function assertNotExpired(proposal: TradeProposal, nowMs = Date.now(), ttlMs = PROPOSAL_TTL_MS): void {
  const age = nowMs - Date.parse(proposal.createdAt);
  if (age > ttlMs) {
    throw new Error("Proposal expired — re-evaluate before paper execution");
  }
}

export function assertFreshRisk(decision: RiskEngineResult["decision"]): void {
  if (decision === "REJECT") {
    throw new Error("Risk REJECT — paper execution blocked (re-evaluated at execute)");
  }
}
