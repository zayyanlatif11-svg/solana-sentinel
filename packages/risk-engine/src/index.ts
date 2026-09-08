import {
  type CandidateAsset,
  type OpportunityScore,
  type Position,
  type PortfolioSnapshot,
  type RiskConfig,
  type RiskEngineResult,
  DEFAULT_RISK_CONFIG,
  nowIso,
  createEvent,
  type SystemEvent,
} from "@sat/shared";

export interface RiskContext {
  portfolio: PortfolioSnapshot;
  positions: Position[];
  requestedSizeUsd: number;
  score: OpportunityScore;
  estimatedPriceImpactPct?: number | null;
  slippageBps?: number;
  dailyTurnoverUsd?: number;
  lastTradeAtByMint?: Record<string, string>;
}

export class RiskEngine {
  constructor(private readonly config: RiskConfig = DEFAULT_RISK_CONFIG) {}

  evaluate(asset: CandidateAsset, ctx: RiskContext): {
    result: RiskEngineResult;
    events: SystemEvent[];
  } {
    const checks: RiskEngineResult["checks"] = [];
    const reasons: string[] = [];
    let size = ctx.requestedSizeUsd;
    const events: SystemEvent[] = [];

    const add = (name: string, passed: boolean, detail: string) => {
      checks.push({ name, passed, detail });
      if (!passed) reasons.push(detail);
    };

    add(
      "min_score",
      ctx.score.compositeScore >= this.config.minScore,
      `Score ${ctx.score.compositeScore.toFixed(1)} vs min ${this.config.minScore}`,
    );

    add(
      "capital_floor",
      ctx.portfolio.navUsd >= this.config.capitalFloorUsd,
      `NAV $${ctx.portfolio.navUsd.toFixed(0)} vs floor $${this.config.capitalFloorUsd}`,
    );

    add(
      "max_drawdown",
      ctx.portfolio.drawdownPct <= this.config.maxDrawdownPct,
      `Drawdown ${(ctx.portfolio.drawdownPct * 100).toFixed(2)}% vs max ${(this.config.maxDrawdownPct * 100).toFixed(2)}%`,
    );

    const liq = asset.liquidityUsd ?? 0;
    add(
      "min_liquidity",
      liq >= this.config.minLiquidityUsd,
      `Liquidity $${liq.toFixed(0)} vs min $${this.config.minLiquidityUsd}`,
    );

    const impact = ctx.estimatedPriceImpactPct ?? null;
    if (impact != null) {
      add(
        "max_price_impact",
        impact <= this.config.maxPriceImpactPct,
        `Impact ${impact.toFixed(2)}% vs max ${this.config.maxPriceImpactPct}%`,
      );
    } else {
      add("max_price_impact", true, "Price impact not provided — skipped");
    }

    const slip = ctx.slippageBps ?? 50;
    add(
      "max_slippage",
      slip <= this.config.maxSlippageBps,
      `Slippage ${slip}bps vs max ${this.config.maxSlippageBps}bps`,
    );

    const openCount = ctx.positions.filter((p) => p.qty > 0).length;
    const alreadyOpen = ctx.positions.some((p) => p.mint === asset.mint && p.qty > 0);
    add(
      "max_positions",
      alreadyOpen || openCount < this.config.maxSimultaneousPositions,
      `Open positions ${openCount} vs max ${this.config.maxSimultaneousPositions}`,
    );

    if (size > this.config.maxPositionUsd) {
      size = this.config.maxPositionUsd;
      checks.push({
        name: "max_position_size",
        passed: true,
        detail: `Reduced to max position $${this.config.maxPositionUsd}`,
      });
      reasons.push(`Size reduced to max position $${this.config.maxPositionUsd}`);
    } else {
      add("max_position_size", true, `Requested $${size} within max`);
    }

    const exposure =
      (ctx.portfolio.positionsValueUsd + size) / Math.max(ctx.portfolio.navUsd, 1);
    if (exposure > this.config.maxPortfolioExposurePct) {
      const room =
        this.config.maxPortfolioExposurePct * ctx.portfolio.navUsd -
        ctx.portfolio.positionsValueUsd;
      if (room <= 0) {
        add("max_exposure", false, "No remaining portfolio exposure capacity");
        size = 0;
      } else {
        size = Math.min(size, room);
        checks.push({
          name: "max_exposure",
          passed: true,
          detail: `Reduced size for exposure cap to $${size.toFixed(2)}`,
        });
        reasons.push("Size reduced to respect exposure cap");
      }
    } else {
      add("max_exposure", true, `Exposure ${(exposure * 100).toFixed(1)}% within cap`);
    }

    const turnover = (ctx.dailyTurnoverUsd ?? 0) + size;
    add(
      "max_turnover",
      turnover <= this.config.maxTurnoverUsdPerDay,
      `Projected turnover $${turnover.toFixed(0)} vs max $${this.config.maxTurnoverUsdPerDay}`,
    );

    const last = ctx.lastTradeAtByMint?.[asset.mint];
    if (last) {
      const elapsed = (Date.now() - Date.parse(last)) / 60000;
      add(
        "cooldown",
        elapsed >= this.config.cooldownMinutes,
        `Cooldown ${elapsed.toFixed(1)}m vs ${this.config.cooldownMinutes}m`,
      );
    } else {
      add("cooldown", true, "No recent trade for mint");
    }

    const hardFail = checks.some(
      (c) =>
        !c.passed &&
        [
          "min_score",
          "capital_floor",
          "max_drawdown",
          "min_liquidity",
          "max_price_impact",
          "max_slippage",
          "max_positions",
          "max_turnover",
          "cooldown",
          "max_exposure",
        ].includes(c.name),
    );

    const reduced = size < ctx.requestedSizeUsd && size > 0;
    let decision: RiskEngineResult["decision"] = "APPROVE";
    if (hardFail || size <= 0) decision = "REJECT";
    else if (reduced) decision = "REDUCE_SIZE";

    const result: RiskEngineResult = {
      decision,
      reasons: reasons.length ? reasons : ["All risk checks passed"],
      approvedSizeUsd: decision === "REJECT" ? 0 : size,
      requestedSizeUsd: ctx.requestedSizeUsd,
      checks,
      configVersion: this.config.version,
      assessedAt: nowIso(),
    };

    if (decision === "REJECT") {
      events.push(
        createEvent("RISK_REJECTED", result.reasons[0] ?? "Rejected", {
          mint: asset.mint,
          configVersions: { risk: this.config.version },
          payload: { checks },
        }),
      );
    }

    return { result, events };
  }
}
