import {
  type ExecutionQuote,
  type PaperOrder,
  type Position,
  type PortfolioSnapshot,
  newId,
  nowIso,
  createEvent,
  type SystemEvent,
} from "@sat/shared";

export interface PaperFillModelConfig {
  spreadBps: number;
  baseSlippageBps: number;
  impactCoef: number;
  networkCostUsd: number;
  latencyMsMin: number;
  latencyMsMax: number;
  failProbability: number;
  partialProbability: number;
  staleQuoteMs: number;
}

function envProb(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const DEFAULT_PAPER_FILL_CONFIG: PaperFillModelConfig = {
  spreadBps: 8,
  baseSlippageBps: 12,
  impactCoef: 0.15,
  networkCostUsd: 0.02,
  latencyMsMin: 80,
  latencyMsMax: 450,
  failProbability: envProb("PAPER_FAIL_PROBABILITY", 0.03),
  partialProbability: envProb("PAPER_PARTIAL_PROBABILITY", 0.12),
  staleQuoteMs: 15_000,
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class PaperTradingEngine {
  constructor(private readonly config: PaperFillModelConfig = DEFAULT_PAPER_FILL_CONFIG) {}

  createAndFill(params: {
    mint: string;
    side: "BUY" | "SELL";
    requestedUsd: number;
    markPriceUsd: number;
    quote?: ExecutionQuote;
    provenance: PaperOrder["provenance"];
    isDemo?: boolean;
  }): { order: PaperOrder; events: SystemEvent[] } {
    const createdAt = nowIso();
    const events: SystemEvent[] = [];
    const latencyMs = Math.round(rand(this.config.latencyMsMin, this.config.latencyMsMax));

    // Stale quote check
    if (params.quote) {
      const age = Date.now() - Date.parse(params.quote.quotedAt);
      if (age > this.config.staleQuoteMs) {
        const order: PaperOrder = {
          id: newId(),
          mint: params.mint,
          side: params.side,
          requestedUsd: params.requestedUsd,
          filledUsd: 0,
          filledQty: 0,
          avgPriceUsd: null,
          status: "STALE_REJECTED",
          spreadCostUsd: 0,
          slippageCostUsd: 0,
          impactCostUsd: 0,
          networkCostUsd: 0,
          latencyMs,
          provenance: params.provenance,
          createdAt,
          updatedAt: nowIso(),
          isDemo: params.isDemo ?? true,
        };
        events.push(
          createEvent("PAPER_ORDER_CREATED", "Order rejected: stale quote", {
            mint: params.mint,
            payload: { orderId: order.id, age },
          }),
        );
        return { order, events };
      }
    }

    if (Math.random() < this.config.failProbability) {
      const order: PaperOrder = {
        id: newId(),
        mint: params.mint,
        side: params.side,
        requestedUsd: params.requestedUsd,
        filledUsd: 0,
        filledQty: 0,
        avgPriceUsd: null,
        status: "FAILED",
        spreadCostUsd: 0,
        slippageCostUsd: 0,
        impactCostUsd: 0,
        networkCostUsd: this.config.networkCostUsd,
        latencyMs,
        provenance: params.provenance,
        createdAt,
        updatedAt: nowIso(),
        isDemo: params.isDemo ?? true,
      };
      events.push(
        createEvent("PAPER_ORDER_CREATED", "Paper order failed (simulated)", {
          mint: params.mint,
          payload: { orderId: order.id },
        }),
      );
      return { order, events };
    }

    const partial = Math.random() < this.config.partialProbability;
    const fillRatio = partial ? rand(0.4, 0.85) : 1;
    const filledUsd = params.requestedUsd * fillRatio;

    const impactBps =
      this.config.impactCoef * Math.sqrt(Math.max(filledUsd, 1)) * 0.1;
    const slipBps =
      this.config.baseSlippageBps +
      (params.quote?.priceImpactPct != null ? params.quote.priceImpactPct * 100 : 0) * 0.2;
    const totalPenaltyBps = this.config.spreadBps + slipBps + impactBps;
    const dir = params.side === "BUY" ? 1 : -1;
    const avgPriceUsd = params.markPriceUsd * (1 + (dir * totalPenaltyBps) / 10_000);
    const filledQty = avgPriceUsd > 0 ? filledUsd / avgPriceUsd : 0;

    const spreadCostUsd = filledUsd * (this.config.spreadBps / 10_000);
    const slippageCostUsd = filledUsd * (slipBps / 10_000);
    const impactCostUsd = filledUsd * (impactBps / 10_000);

    const order: PaperOrder = {
      id: newId(),
      mint: params.mint,
      side: params.side,
      requestedUsd: params.requestedUsd,
      filledUsd,
      filledQty,
      avgPriceUsd,
      status: partial ? "PARTIAL" : "FILLED",
      spreadCostUsd,
      slippageCostUsd,
      impactCostUsd,
      networkCostUsd: this.config.networkCostUsd,
      latencyMs,
      provenance: params.provenance,
      createdAt,
      updatedAt: nowIso(),
      isDemo: params.isDemo ?? true,
    };

    events.push(
      createEvent("PAPER_ORDER_CREATED", `Paper order ${order.status}`, {
        mint: params.mint,
        payload: { orderId: order.id },
      }),
    );
    events.push(
      createEvent("PAPER_ORDER_FILLED", `Filled $${filledUsd.toFixed(2)}`, {
        mint: params.mint,
        payload: {
          orderId: order.id,
          filledUsd,
          avgPriceUsd,
          costs: {
            spreadCostUsd,
            slippageCostUsd,
            impactCostUsd,
            networkCostUsd: this.config.networkCostUsd,
          },
        },
      }),
    );

    return { order, events };
  }
}

export function applyFillToPortfolio(
  snapshot: PortfolioSnapshot,
  positions: Position[],
  order: PaperOrder,
  symbol: string,
): { snapshot: PortfolioSnapshot; positions: Position[]; events: SystemEvent[] } {
  const events: SystemEvent[] = [];
  if (order.status !== "FILLED" && order.status !== "PARTIAL") {
    return { snapshot, positions, events };
  }

  const costs =
    order.spreadCostUsd +
    order.slippageCostUsd +
    order.impactCostUsd +
    order.networkCostUsd;
  let cash = snapshot.cashUsd;
  const nextPositions = [...positions];
  const idx = nextPositions.findIndex((p) => p.mint === order.mint);
  const ts = nowIso();

  if (order.side === "BUY") {
    cash -= order.filledUsd + costs;
    if (idx >= 0) {
      const p = nextPositions[idx]!;
      const newQty = p.qty + order.filledQty;
      const newAvg =
        newQty > 0
          ? (p.avgEntryUsd * p.qty + (order.avgPriceUsd ?? 0) * order.filledQty) / newQty
          : p.avgEntryUsd;
      nextPositions[idx] = {
        ...p,
        qty: newQty,
        avgEntryUsd: newAvg,
        markUsd: order.avgPriceUsd ?? p.markUsd,
        unrealizedPnlUsd: (order.avgPriceUsd ?? p.markUsd) * newQty - newAvg * newQty,
        updatedAt: ts,
      };
      events.push(
        createEvent("POSITION_UPDATED", `Added to ${symbol}`, {
          mint: order.mint,
        }),
      );
    } else {
      nextPositions.push({
        id: newId(),
        mint: order.mint,
        symbol,
        qty: order.filledQty,
        avgEntryUsd: order.avgPriceUsd ?? 0,
        markUsd: order.avgPriceUsd ?? 0,
        unrealizedPnlUsd: 0,
        realizedPnlUsd: 0,
        openedAt: ts,
        updatedAt: ts,
      });
      events.push(
        createEvent("POSITION_OPENED", `Opened ${symbol}`, { mint: order.mint }),
      );
    }
  } else {
    cash += order.filledUsd - costs;
    if (idx >= 0) {
      const p = nextPositions[idx]!;
      const sellQty = Math.min(p.qty, order.filledQty);
      const realized = ((order.avgPriceUsd ?? p.markUsd) - p.avgEntryUsd) * sellQty;
      const newQty = p.qty - sellQty;
      if (newQty <= 1e-12) {
        nextPositions.splice(idx, 1);
        events.push(
          createEvent("POSITION_CLOSED", `Closed ${symbol}`, {
            mint: order.mint,
            payload: { realized },
          }),
        );
      } else {
        nextPositions[idx] = {
          ...p,
          qty: newQty,
          realizedPnlUsd: p.realizedPnlUsd + realized,
          updatedAt: ts,
        };
        events.push(
          createEvent("POSITION_UPDATED", `Reduced ${symbol}`, { mint: order.mint }),
        );
      }
    }
  }

  const positionsValueUsd = nextPositions.reduce((s, p) => s + p.qty * p.markUsd, 0);
  const navUsd = cash + positionsValueUsd;
  const peakNavUsd = Math.max(snapshot.peakNavUsd, navUsd);
  const drawdownPct = peakNavUsd > 0 ? (peakNavUsd - navUsd) / peakNavUsd : 0;

  return {
    snapshot: {
      timestamp: ts,
      navUsd,
      cashUsd: cash,
      positionsValueUsd,
      drawdownPct,
      peakNavUsd,
    },
    positions: nextPositions,
    events,
  };
}
