import {
  type CandidateAsset,
  type SignalResult,
  type MarketRegime,
  createEvent,
  type SystemEvent,
} from "@sat/shared";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function norm(value: number, scale: number): number {
  return clamp(value / scale, -1, 1);
}

export function computeMomentum(asset: CandidateAsset): SignalResult {
  const c1 = asset.priceChange1hPct ?? 0;
  const c24 = asset.priceChange24hPct ?? 0;
  const c7 = asset.priceChange7dPct ?? 0;
  const value = c1 * 0.3 + c24 * 0.5 + c7 * 0.2;
  const confidence =
    [asset.priceChange1hPct, asset.priceChange24hPct, asset.priceChange7dPct].filter(
      (x) => x != null,
    ).length / 3;
  return {
    name: "momentum",
    value,
    normalizedScore: norm(value, 20),
    confidence,
    source: "deterministic-v1",
    timestamp: new Date().toISOString(),
  };
}

export function computeVolume(asset: CandidateAsset): SignalResult {
  const vol = asset.volume24hUsd ?? 0;
  const change = asset.volumeChange24hPct ?? 0;
  const value = Math.log10(Math.max(vol, 1)) + change / 50;
  return {
    name: "volume",
    value,
    normalizedScore: norm(change, 50),
    confidence: asset.volume24hUsd != null ? 0.85 : 0.2,
    source: "deterministic-v1",
    timestamp: new Date().toISOString(),
  };
}

export function computeLiquidity(asset: CandidateAsset): SignalResult {
  const liq = asset.liquidityUsd ?? 0;
  const value = Math.log10(Math.max(liq, 1));
  // Prefer higher liquidity; map log10(1e5)=5 → mid, log10(1e7)=7 → strong
  const normalizedScore = clamp((value - 5) / 3, -1, 1);
  return {
    name: "liquidity",
    value: liq,
    normalizedScore,
    confidence: asset.liquidityUsd != null ? 0.9 : 0.1,
    source: "deterministic-v1",
    timestamp: new Date().toISOString(),
  };
}

export function computeRelativeStrength(
  asset: CandidateAsset,
  benchmarkChange24hPct = 2.0,
): SignalResult {
  const c24 = asset.priceChange24hPct ?? 0;
  const rs = c24 - benchmarkChange24hPct;
  return {
    name: "relative_strength",
    value: rs,
    normalizedScore: norm(rs, 15),
    confidence: asset.priceChange24hPct != null ? 0.8 : 0.2,
    source: "deterministic-v1",
    timestamp: new Date().toISOString(),
    meta: { benchmarkChange24hPct },
  };
}

export function computeVolatility(asset: CandidateAsset): SignalResult {
  const moves = [
    Math.abs(asset.priceChange1hPct ?? 0) * 24,
    Math.abs(asset.priceChange24hPct ?? 0),
    Math.abs(asset.priceChange7dPct ?? 0) / 7,
  ];
  const value = moves.reduce((a, b) => a + b, 0) / moves.length;
  // High vol → negative score for risk-adjusted preference
  return {
    name: "volatility",
    value,
    normalizedScore: -norm(value, 25),
    confidence: 0.7,
    source: "deterministic-v1",
    timestamp: new Date().toISOString(),
  };
}

export function computeMarketRegime(assets: CandidateAsset[]): {
  regime: MarketRegime;
  signal: SignalResult;
} {
  const changes = assets
    .map((a) => a.priceChange24hPct)
    .filter((x): x is number => x != null);
  const avg = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  const vols = assets.map((a) => Math.abs(a.priceChange24hPct ?? 0));
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;

  let regime: MarketRegime = "NEUTRAL";
  if (avgVol > 12) regime = "HIGH_VOLATILITY";
  else if (avg > 3) regime = "RISK_ON";
  else if (avg < -3) regime = "RISK_OFF";

  const scoreMap: Record<MarketRegime, number> = {
    RISK_ON: 0.6,
    NEUTRAL: 0.1,
    RISK_OFF: -0.5,
    HIGH_VOLATILITY: -0.3,
  };

  return {
    regime,
    signal: {
      name: "market_regime",
      value: avg,
      normalizedScore: scoreMap[regime],
      confidence: changes.length >= 3 ? 0.75 : 0.4,
      source: "deterministic-v1",
      timestamp: new Date().toISOString(),
      meta: { regime, avgVol },
    },
  };
}

export function computeOnChain(asset: CandidateAsset): SignalResult {
  const holders = asset.holderCount ?? 0;
  const age = asset.tokenAgeHours ?? 0;
  const holderScore = clamp(Math.log10(Math.max(holders, 1)) / 6, 0, 1);
  const ageScore = clamp(age / (24 * 365), 0, 1);
  const value = (holderScore + ageScore) / 2;
  return {
    name: "on_chain",
    value,
    normalizedScore: value * 2 - 1,
    confidence: asset.holderCount != null && asset.tokenAgeHours != null ? 0.8 : 0.35,
    source: "deterministic-v1",
    timestamp: new Date().toISOString(),
  };
}

export function computeAllSignals(
  asset: CandidateAsset,
  universe: CandidateAsset[] = [asset],
): { signals: SignalResult[]; events: SystemEvent[]; regime: MarketRegime } {
  const { regime, signal: regimeSignal } = computeMarketRegime(universe);
  const signals = [
    computeMomentum(asset),
    computeVolume(asset),
    computeLiquidity(asset),
    computeRelativeStrength(asset),
    computeVolatility(asset),
    regimeSignal,
    computeOnChain(asset),
  ];
  const events = signals.map((s) =>
    createEvent("SIGNAL_GENERATED", `${s.name}=${s.normalizedScore.toFixed(3)}`, {
      mint: asset.mint,
      payload: { signal: s },
    }),
  );
  return { signals, events, regime };
}

export function scoreOpportunity(
  asset: CandidateAsset,
  signals: SignalResult[],
  opts: {
    weights: Record<string, number>;
    strategyConfigVersion: string;
    riskScore?: number;
    researchConfidence?: number;
  },
): {
  compositeScore: number;
  components: Record<string, number>;
  explanation: string[];
} {
  const byName = Object.fromEntries(signals.map((s) => [s.name, s]));
  const to01 = (n: number) => (n + 1) / 2;

  const components: Record<string, number> = {
    momentum: to01(byName.momentum?.normalizedScore ?? 0) * 100,
    volume: to01(byName.volume?.normalizedScore ?? 0) * 100,
    liquidity: to01(byName.liquidity?.normalizedScore ?? 0) * 100,
    relativeStrength: to01(byName.relative_strength?.normalizedScore ?? 0) * 100,
    regime: to01(byName.market_regime?.normalizedScore ?? 0) * 100,
    onChain: to01(byName.on_chain?.normalizedScore ?? 0) * 100,
    riskReward:
      opts.riskScore != null ? clamp(100 - opts.riskScore, 0, 100) : 50,
    research: (opts.researchConfidence ?? 0.5) * 100,
  };

  const w = opts.weights;
  const weightSum =
    w.momentum +
    w.volume +
    w.liquidity +
    w.relativeStrength +
    w.regime +
    w.onChain +
    w.riskReward +
    w.research;

  const compositeScore =
    (components.momentum * w.momentum +
      components.volume * w.volume +
      components.liquidity * w.liquidity +
      components.relativeStrength * w.relativeStrength +
      components.regime * w.regime +
      components.onChain * w.onChain +
      components.riskReward * w.riskReward +
      components.research * w.research) /
    weightSum;

  const explanation = [
    `Composite ${compositeScore.toFixed(1)} using ${opts.strategyConfigVersion}`,
    `Momentum ${components.momentum.toFixed(0)} (w=${w.momentum})`,
    `Liquidity ${components.liquidity.toFixed(0)} (w=${w.liquidity})`,
    `Risk/reward ${components.riskReward.toFixed(0)} (w=${w.riskReward})`,
  ];

  return { compositeScore, components, explanation };
}
