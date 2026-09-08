import {
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_RISK_CONFIG,
  DEFAULT_POLICY_CONFIG,
  USDC,
  type TradeProposal,
  type OpportunityScore,
  type OperatingMode,
  newId,
  nowIso,
  createEvent,
  isLiveTradingAllowed,
} from "@sat/shared";
import { getDatabase, type Database } from "@sat/database";
import { createMarketDataProvider } from "@sat/market-data";
import { createOnChainProvider } from "@sat/solana";
import { DiscoveryService } from "@sat/discovery";
import { computeAllSignals, scoreOpportunity } from "@sat/signals";
import { assessTokenRisk } from "@sat/token-risk";
import { PolicyEngine } from "@sat/policy-engine";
import { createResearchProvider } from "@sat/research-agent";
import { RiskEngine } from "@sat/risk-engine";
import { proposeSizeUsd } from "@sat/portfolio";
import { createExecutionProvider } from "@sat/execution";
import { PaperTradingEngine, applyFillToPortfolio } from "@sat/paper-trading";
import { runExperimentReplay } from "@sat/experiments";

export function getOperatingMode(): OperatingMode {
  const m = (process.env.OPERATING_MODE ?? "PAPER").toUpperCase();
  if (m === "LIVE") return "PAPER"; // hard remap — live disabled
  if (m === "DEMO" || m === "READ_ONLY" || m === "PAPER") return m;
  return "PAPER";
}

export async function runDiscoveryCycle(db: Database = getDatabase()) {
  const market = createMarketDataProvider();
  const discovery = new DiscoveryService(market);
  const { candidates, events, mode } = await discovery.discover(20);
  db.setCandidates(candidates);
  db.addEvents(events);
  db.addEvents([
    createEvent("TOKEN_DISCOVERED", `Discovery cycle complete (${mode})`, {
      payload: { count: candidates.length, provider: market.name, isDemo: market.isDemo },
    }),
  ]);
  return { candidates, mode, provider: market.name, isDemo: market.isDemo };
}

export async function evaluateMint(
  mint: string,
  db: Database = getDatabase(),
): Promise<TradeProposal | null> {
  const state = db.getState();
  let asset = state.candidates.find((c) => c.mint === mint);
  if (!asset) {
    const market = createMarketDataProvider();
    asset = (await market.getAsset(mint)) ?? undefined;
  }
  if (!asset) return null;

  const onChain = createOnChainProvider();
  const riskInputs = await onChain.getTokenRiskInputs(mint);
  const tokenRisk = assessTokenRisk(asset, riskInputs);
  db.addTokenRisk(tokenRisk);

  const policyEngine = new PolicyEngine(DEFAULT_POLICY_CONFIG);
  const { assessment: policy, events: policyEvents } = policyEngine.evaluate(asset);
  db.addPolicy(policy);
  db.addEvents(policyEvents);

  const { signals, events: signalEvents, regime } = computeAllSignals(
    asset,
    state.candidates.length ? state.candidates : [asset],
  );
  db.addEvents(signalEvents);

  const research = await createResearchProvider().research(
    asset,
    `regime=${regime}; riskTier=${tokenRisk.riskTier}`,
  );
  db.addResearch(research);

  const scored = scoreOpportunity(asset, signals, {
    weights: DEFAULT_STRATEGY_CONFIG.weights,
    strategyConfigVersion: DEFAULT_STRATEGY_CONFIG.version,
    riskScore: tokenRisk.riskScore,
    researchConfidence: research.confidence,
  });

  const score: OpportunityScore = {
    mint: asset.mint,
    compositeScore: scored.compositeScore,
    components: scored.components,
    weights: DEFAULT_STRATEGY_CONFIG.weights,
    strategyConfigVersion: DEFAULT_STRATEGY_CONFIG.version,
    explanation: scored.explanation,
    scoredAt: nowIso(),
  };
  db.addScore(score);

  const requested = proposeSizeUsd(
    state.portfolio.navUsd,
    score.compositeScore,
    DEFAULT_RISK_CONFIG.maxPositionUsd,
  );

  const riskEngine = new RiskEngine(DEFAULT_RISK_CONFIG);
  const { result: risk, events: riskEvents } = riskEngine.evaluate(asset, {
    portfolio: state.portfolio,
    positions: state.positions,
    requestedSizeUsd: requested,
    score,
    estimatedPriceImpactPct: tokenRisk.details.estimatedPriceImpactPct,
    slippageBps: 50,
    dailyTurnoverUsd: state.orders
      .filter((o) => Date.now() - Date.parse(o.createdAt) < 86_400_000)
      .reduce((s, o) => s + o.filledUsd, 0),
    lastTradeAtByMint: Object.fromEntries(
      state.orders.map((o) => [o.mint, o.createdAt]),
    ),
  });
  db.addEvents(riskEvents);

  let status: TradeProposal["status"] = "PROPOSED";
  if (policy.decision === "REJECTED") status = "REJECTED";
  else if (policy.decision === "MANUAL_REVIEW") status = "REJECTED";
  else if (risk.decision === "REJECT") status = "REJECTED";
  else if (tokenRisk.riskTier === "HIGH_RISK" || tokenRisk.riskTier === "INSUFFICIENT_DATA")
    status = "REJECTED";

  // Duplicate proposal guard
  const dup = state.proposals.find(
    (p) =>
      p.mint === mint &&
      p.status === "PROPOSED" &&
      Date.now() - Date.parse(p.createdAt) < 15 * 60_000,
  );
  if (dup) {
    db.addEvents([
      createEvent("TRADE_PROPOSED", "Duplicate proposal suppressed", {
        mint,
        payload: { existingId: dup.id },
      }),
    ]);
    return dup;
  }

  const proposal: TradeProposal = {
    id: newId(),
    mint: asset.mint,
    symbol: asset.symbol,
    side: "BUY",
    sizeUsd: risk.approvedSizeUsd || requested,
    score,
    tokenRisk,
    policy,
    risk,
    research,
    signals,
    status,
    createdAt: nowIso(),
  };
  db.addProposal(proposal);
  db.addEvents([
    createEvent("TRADE_PROPOSED", `${status}: ${asset.symbol} $${proposal.sizeUsd.toFixed(0)}`, {
      mint,
      payload: { proposalId: proposal.id, status },
      configVersions: {
        strategy: DEFAULT_STRATEGY_CONFIG.version,
        risk: DEFAULT_RISK_CONFIG.version,
        policy: DEFAULT_POLICY_CONFIG.version,
      },
    }),
  ]);
  return proposal;
}

export async function executePaperProposal(
  proposalId: string,
  db: Database = getDatabase(),
) {
  const mode = getOperatingMode();
  if (mode === "READ_ONLY") {
    throw new Error("READ_ONLY mode — paper execution disabled");
  }

  const state = db.getState();
  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status === "REJECTED") throw new Error("Cannot execute rejected proposal");
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
  const exec = createExecutionProvider();
  const amount = String(Math.floor(proposal.sizeUsd * 1_000_000)); // USDC 6 dec assumption for quote
  const quote = await exec.quote({
    inputMint: USDC,
    outputMint: proposal.mint,
    amount,
    slippageBps: 50,
  });
  const plan = await exec.plan(quote, mode);

  const paper = new PaperTradingEngine();
  const asset = state.candidates.find((c) => c.mint === proposal.mint);
  const mark = asset?.priceUsd ?? 1;
  const { order, events } = paper.createAndFill({
    mint: proposal.mint,
    side: proposal.side,
    requestedUsd: proposal.risk.approvedSizeUsd || proposal.sizeUsd,
    markPriceUsd: mark,
    quote,
    provenance: {
      opportunityScoreId: proposal.id,
      strategyConfigVersion: proposal.score.strategyConfigVersion,
      riskConfigVersion: proposal.risk.configVersion,
      dataSources: asset?.dataSources ?? ["demo"],
      reasons: [
        ...proposal.score.explanation,
        ...proposal.risk.reasons.slice(0, 3),
        `Execution plan mode=${plan.mode} canBroadcast=${plan.canBroadcast}`,
      ],
    },
    isDemo: quote.isDemo || asset?.isDemo,
  });
  db.addOrder(order);
  db.addEvents(events);

  const applied = applyFillToPortfolio(
    state.portfolio,
    state.positions,
    order,
    proposal.symbol,
  );
  db.setPortfolio(applied.snapshot);
  db.setPositions(applied.positions);
  db.addEvents(applied.events);
  db.pushEquity(applied.snapshot.navUsd);

  // Only consume the proposal on an actual (possibly partial) fill so FAILED/STALE can retry.
  if (order.status === "FILLED" || order.status === "PARTIAL") {
    proposal.status = "ACCEPTED_PAPER";
    db.addProposal(proposal);
  }

  return { order, plan, quote, portfolio: applied.snapshot };
}

export async function runFullResearchPass(db: Database = getDatabase()) {
  const { candidates } = await runDiscoveryCycle(db);
  const proposals = [];
  for (const c of candidates.filter((x) => x.symbol !== "SOL").slice(0, 8)) {
    const p = await evaluateMint(c.mint, db);
    if (p) proposals.push(p);
  }
  return proposals;
}

export function runDemoExperiment(db: Database = getDatabase()) {
  const state = db.getState();
  const start = state.equityHistory[0]?.nav ?? 100_000;
  let equity = state.equityHistory.map((e) => e.nav);
  if (equity.length < 10) {
    // Synthetic short demo path for UI — labeled as demo replay, not live performance
    equity = Array.from({ length: 60 }, (_, i) => {
      const wave = Math.sin(i / 7) * 0.004 + i * 0.0004;
      return start * (1 + wave);
    });
  }
  const solPrices = equity.map((_, i) => 140 * (1 + i * 0.0015));
  const btcPrices = equity.map((_, i) => 60_000 * (1 + i * 0.001));
  const costDrag = state.orders.reduce(
    (s, o) => s + o.spreadCostUsd + o.slippageCostUsd + o.impactCostUsd + o.networkCostUsd,
    0,
  );
  const result = runExperimentReplay({
    name: "demo-paper-replay-v1",
    strategyEquity: equity,
    solPrices,
    btcPrices,
    startingCapital: start,
    costDragUsd: costDrag,
  });
  db.addExperiment(result);
  return result;
}

export function getSystemHealth(db: Database = getDatabase()) {
  const state = db.getState();
  return {
    operatingMode: getOperatingMode(),
    liveTradingAllowed: isLiveTradingAllowed(),
    canBroadcast: false,
    persistence: state.mode,
    demoMode: process.env.DEMO_MODE !== "false",
    candidates: state.candidates.length,
    proposals: state.proposals.length,
    openPositions: state.positions.length,
    orders: state.orders.length,
    events: state.events.length,
    navUsd: state.portfolio.navUsd,
    drawdownPct: state.portfolio.drawdownPct,
    providers: {
      market: createMarketDataProvider().name,
      onchain: createOnChainProvider().name,
      execution: createExecutionProvider().name,
      research: process.env.OPENAI_API_KEY ? "openai-compatible" : "mock",
    },
  };
}
