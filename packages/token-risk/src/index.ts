import {
  type CandidateAsset,
  type TokenRiskAssessment,
  type RiskTier,
  nowIso,
} from "@sat/shared";

export const TOKEN_RISK_CONFIG_VERSION = "token-risk-v1.5";

export interface OnChainRiskInput {
  tokenProgram?: "TOKEN" | "TOKEN_2022" | "UNKNOWN";
  mintAuthority?: boolean | null;
  freezeAuthority?: boolean | null;
  permanentDelegate?: boolean | null;
  transferRestrictions?: boolean | null;
  transferHook?: boolean | null;
  token2022Extensions?: string[] | null;
  topHolderConcentrationPct?: number | null;
  top5HolderConcentrationPct?: number | null;
  top10HolderConcentrationPct?: number | null;
  exitLiquidityUsd?: number | null;
  estimatedPriceImpactPct?: number | null;
  metadataQuality?: number | null;
}

function tierFromScore(score: number, confidence: number): RiskTier {
  if (confidence < 0.35) return "INSUFFICIENT_DATA";
  if (score >= 70) return "HIGH_RISK";
  if (score >= 40) return "ELEVATED_RISK";
  return "LOWER_RISK";
}

export function assessTokenRisk(
  asset: CandidateAsset,
  onChain: OnChainRiskInput = {},
): TokenRiskAssessment {
  const flags: string[] = [...asset.riskFlags];
  const reasons: string[] = [];
  const missing: string[] = [];
  let score = 0;
  let observations = 0;
  let available = 0;

  const bump = (pts: number, flag: string, reason: string) => {
    score += pts;
    flags.push(flag);
    reasons.push(reason);
  };

  const tokenProgram = onChain.tokenProgram ?? "UNKNOWN";
  observations++;
  if (tokenProgram === "UNKNOWN") {
    missing.push("tokenProgram");
  } else {
    available++;
    if (tokenProgram === "TOKEN_2022") {
      bump(8, "TOKEN_2022", "Token-2022 program — review extensions carefully");
    }
  }

  if (onChain.mintAuthority == null) missing.push("mintAuthority");
  else {
    available++;
    observations++;
    if (onChain.mintAuthority) bump(18, "MINT_AUTHORITY", "Mint authority is enabled");
  }

  if (onChain.freezeAuthority == null) missing.push("freezeAuthority");
  else {
    available++;
    observations++;
    if (onChain.freezeAuthority) bump(15, "FREEZE_AUTHORITY", "Freeze authority is enabled");
  }

  if (onChain.permanentDelegate == null) {
    if (tokenProgram === "TOKEN_2022") missing.push("permanentDelegate");
  } else {
    available++;
    observations++;
    if (onChain.permanentDelegate)
      bump(25, "PERMANENT_DELEGATE", "Permanent delegate can move tokens");
  }

  if (onChain.transferHook == null) {
    if (tokenProgram === "TOKEN_2022") missing.push("transferHook");
  } else {
    available++;
    observations++;
    if (onChain.transferHook) bump(22, "TRANSFER_HOOK", "Transfer hook program is present");
  }

  if (onChain.transferRestrictions == null) {
    if (tokenProgram === "TOKEN_2022") missing.push("transferRestrictions");
  } else {
    available++;
    observations++;
    if (onChain.transferRestrictions)
      bump(20, "TRANSFER_RESTRICTED", "Transfer hooks/restrictions present");
  }

  const top5 = onChain.top5HolderConcentrationPct ?? null;
  const top10 = onChain.top10HolderConcentrationPct ?? null;
  const concentration = onChain.topHolderConcentrationPct ?? top5 ?? top10;
  if (concentration == null) missing.push("topHolderConcentrationPct");
  else {
    available++;
    observations++;
    if (concentration > 60)
      bump(20, "HOLDER_CONCENTRATION", `Top holders control ${concentration.toFixed(1)}%`);
    else if (concentration > 40)
      bump(10, "HOLDER_CONCENTRATION_MODERATE", `Top holders control ${concentration.toFixed(1)}%`);
  }
  if (top5 == null) missing.push("top5HolderConcentrationPct");
  if (top10 == null) missing.push("top10HolderConcentrationPct");

  const liq = asset.liquidityUsd;
  if (liq == null) missing.push("liquidityUsd");
  else {
    available++;
    observations++;
    if (liq < 50_000) bump(25, "LOW_LIQUIDITY", `Liquidity $${liq.toFixed(0)} is very low`);
    else if (liq < 250_000) bump(12, "THIN_LIQUIDITY", `Liquidity $${liq.toFixed(0)} is thin`);
  }

  const exitLiq = onChain.exitLiquidityUsd ?? asset.liquidityUsd;
  if (exitLiq == null) missing.push("exitLiquidityUsd");
  else {
    available++;
    observations++;
    if (exitLiq < 25_000)
      bump(15, "EXIT_LIQUIDITY", `Exit liquidity $${exitLiq.toFixed(0)} is poor`);
  }

  const age = asset.tokenAgeHours;
  if (age == null) missing.push("tokenAgeHours");
  else {
    available++;
    observations++;
    if (age < 24) bump(20, "VERY_NEW", "Token age under 24 hours");
    else if (age < 24 * 7) bump(10, "NEW_TOKEN", "Token age under 7 days");
  }

  const metaQ = onChain.metadataQuality ?? (asset.name && asset.symbol ? 0.7 : 0.2);
  available++;
  observations++;
  if (metaQ < 0.4) bump(8, "POOR_METADATA", "Metadata quality is weak");

  const impact = onChain.estimatedPriceImpactPct;
  if (impact == null) missing.push("estimatedPriceImpactPct");
  else {
    available++;
    observations++;
    if (impact > 5) bump(18, "HIGH_PRICE_IMPACT", `Est. impact ${impact.toFixed(2)}%`);
    else if (impact > 2) bump(8, "MODERATE_PRICE_IMPACT", `Est. impact ${impact.toFixed(2)}%`);
  }

  if (asset.holderCount != null && asset.holderCount < 100) {
    bump(12, "FEW_HOLDERS", `Only ${asset.holderCount} holders`);
    available++;
    observations++;
  }

  if (onChain.token2022Extensions == null && tokenProgram === "TOKEN_2022") {
    missing.push("token2022Extensions");
  }

  score = Math.min(100, score);
  const dataConfidence = observations === 0 ? 0 : available / Math.max(observations, 1);
  const adjustedConfidence = Math.max(
    0,
    Math.min(1, dataConfidence - missing.length * 0.03),
  );

  if (missing.length > 5) {
    reasons.push(`Missing data fields: ${missing.join(", ")}`);
  }

  const riskTier = tierFromScore(score, adjustedConfidence);
  if (reasons.length === 0) {
    reasons.push("No elevated deterministic risk flags from available data");
  }

  return {
    mint: asset.mint,
    riskScore: score,
    riskTier,
    riskFlags: [...new Set(flags)],
    riskReasons: reasons,
    dataConfidence: adjustedConfidence,
    details: {
      tokenProgram,
      mintAuthority: onChain.mintAuthority ?? null,
      freezeAuthority: onChain.freezeAuthority ?? null,
      permanentDelegate: onChain.permanentDelegate ?? null,
      transferRestrictions: onChain.transferRestrictions ?? null,
      topHolderConcentrationPct: concentration ?? null,
      liquidityUsd: liq ?? null,
      exitLiquidityUsd: exitLiq ?? null,
      tokenAgeHours: age ?? null,
      metadataQuality: metaQ,
      estimatedPriceImpactPct: impact ?? null,
      top5HolderConcentrationPct: top5,
      top10HolderConcentrationPct: top10,
      transferHook: onChain.transferHook ?? null,
      token2022Extensions: onChain.token2022Extensions ?? null,
      missingFields: missing,
    },
    assessedAt: nowIso(),
    configVersion: TOKEN_RISK_CONFIG_VERSION,
  };
}
