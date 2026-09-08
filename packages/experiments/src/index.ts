import { computePerformance, buyAndHoldSeries, type PerformanceMetrics } from "@sat/analytics";
import {
  DEFAULT_STRATEGY_CONFIG,
  DEFAULT_RISK_CONFIG,
  type StrategyConfig,
  type RiskConfig,
  newId,
  nowIso,
} from "@sat/shared";

export interface ExperimentConfig {
  id: string;
  name: string;
  strategy: StrategyConfig;
  risk: RiskConfig;
  dataSource: string;
  createdAt: string;
}

export interface ExperimentResult {
  experiment: ExperimentConfig;
  strategyMetrics: PerformanceMetrics;
  baselines: {
    cash: PerformanceMetrics;
    solBuyHold: PerformanceMetrics;
    btcBuyHold: PerformanceMetrics | null;
    mechanicalMomentum: PerformanceMetrics;
  };
  notes: string[];
}

export function createExperiment(
  name: string,
  overrides?: Partial<{ strategy: StrategyConfig; risk: RiskConfig; dataSource: string }>,
): ExperimentConfig {
  return {
    id: newId(),
    name,
    strategy: overrides?.strategy ?? DEFAULT_STRATEGY_CONFIG,
    risk: overrides?.risk ?? DEFAULT_RISK_CONFIG,
    dataSource: overrides?.dataSource ?? "demo",
    createdAt: nowIso(),
  };
}

/** Replay a simple equity path and compare to baselines. Does not fabricate live performance. */
export function runExperimentReplay(params: {
  name: string;
  strategyEquity: number[];
  solPrices: number[];
  btcPrices?: number[];
  startingCapital: number;
  costDragUsd?: number;
  mechanicalEquity?: number[];
}): ExperimentResult {
  const experiment = createExperiment(params.name);
  const cashSeries = params.strategyEquity.map(() => params.startingCapital);
  const solBh = buyAndHoldSeries(
    params.startingCapital,
    params.solPrices[0] ?? 1,
    params.solPrices,
  );
  const btcBh =
    params.btcPrices && params.btcPrices.length
      ? buyAndHoldSeries(
          params.startingCapital,
          params.btcPrices[0] ?? 1,
          params.btcPrices,
        )
      : null;

  const mechanical =
    params.mechanicalEquity ??
    params.strategyEquity.map((v, i) => {
      // Simple mechanical baseline: half cash / half SOL B&H blend
      const sol = solBh[i] ?? params.startingCapital;
      return 0.5 * params.startingCapital + 0.5 * sol;
    });

  const notes = [
    "Results are from deterministic replay / demo paths — not live trading performance",
    `Strategy config ${experiment.strategy.version}; risk ${experiment.risk.version}`,
    `Data source: ${experiment.dataSource}`,
  ];

  return {
    experiment,
    strategyMetrics: computePerformance(params.strategyEquity, params.costDragUsd ?? 0),
    baselines: {
      cash: computePerformance(cashSeries),
      solBuyHold: computePerformance(solBh),
      btcBuyHold: btcBh ? computePerformance(btcBh) : null,
      mechanicalMomentum: computePerformance(mechanical),
    },
    notes,
  };
}
