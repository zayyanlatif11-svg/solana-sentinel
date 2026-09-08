import {
  type PortfolioSnapshot,
  type Position,
  nowIso,
} from "@sat/shared";

export function createInitialPortfolio(startingCapitalUsd: number): {
  snapshot: PortfolioSnapshot;
  positions: Position[];
} {
  const ts = nowIso();
  return {
    snapshot: {
      timestamp: ts,
      navUsd: startingCapitalUsd,
      cashUsd: startingCapitalUsd,
      positionsValueUsd: 0,
      drawdownPct: 0,
      peakNavUsd: startingCapitalUsd,
    },
    positions: [],
  };
}

export function markPositions(
  positions: Position[],
  marks: Record<string, number>,
  snapshot: PortfolioSnapshot,
): { positions: Position[]; snapshot: PortfolioSnapshot } {
  const next = positions.map((p) => {
    const mark = marks[p.mint] ?? p.markUsd;
    return {
      ...p,
      markUsd: mark,
      unrealizedPnlUsd: mark * p.qty - p.avgEntryUsd * p.qty,
      updatedAt: nowIso(),
    };
  });
  const positionsValueUsd = next.reduce((s, p) => s + p.qty * p.markUsd, 0);
  const navUsd = snapshot.cashUsd + positionsValueUsd;
  const peakNavUsd = Math.max(snapshot.peakNavUsd, navUsd);
  return {
    positions: next,
    snapshot: {
      timestamp: nowIso(),
      navUsd,
      cashUsd: snapshot.cashUsd,
      positionsValueUsd,
      drawdownPct: peakNavUsd > 0 ? (peakNavUsd - navUsd) / peakNavUsd : 0,
      peakNavUsd,
    },
  };
}

export function proposeSizeUsd(
  navUsd: number,
  score: number,
  maxPositionUsd: number,
): number {
  const scoreFactor = Math.min(Math.max(score / 100, 0.2), 1);
  return Math.min(maxPositionUsd, navUsd * 0.05 * scoreFactor);
}
