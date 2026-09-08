import {
  type CandidateAsset,
  type PolicyAssessment,
  type PolicyConfig,
  DEFAULT_POLICY_CONFIG,
  nowIso,
  createEvent,
  type SystemEvent,
} from "@sat/shared";

export class PolicyEngine {
  constructor(private readonly config: PolicyConfig = DEFAULT_POLICY_CONFIG) {}

  evaluate(asset: CandidateAsset): { assessment: PolicyAssessment; events: SystemEvent[] } {
    const reasons: string[] = [];
    const matched: string[] = [];
    const events: SystemEvent[] = [];

    if (this.config.blacklistMints.includes(asset.mint)) {
      matched.push("blacklist");
      reasons.push("Mint is on the policy blacklist");
      const assessment = this.result(asset, "REJECTED", reasons, matched);
      events.push(
        createEvent("POLICY_REJECTED", reasons[0]!, {
          mint: asset.mint,
          configVersions: { policy: this.config.version },
        }),
      );
      return { assessment, events };
    }

    if (this.config.whitelistMints.length > 0) {
      if (!this.config.whitelistMints.includes(asset.mint)) {
        matched.push("whitelist_miss");
        reasons.push("Mint not on whitelist (whitelist mode active)");
        const assessment = this.result(asset, "REJECTED", reasons, matched);
        events.push(
          createEvent("POLICY_REJECTED", reasons[0]!, {
            mint: asset.mint,
            configVersions: { policy: this.config.version },
          }),
        );
        return { assessment, events };
      }
      matched.push("whitelist");
    }

    if (this.config.manualReviewMints.includes(asset.mint)) {
      matched.push("manual_review_list");
      reasons.push("Mint flagged for manual review");
      return {
        assessment: this.result(asset, "MANUAL_REVIEW", reasons, matched),
        events,
      };
    }

    // Hard deterministic restrictions
    if (this.config.spotOnly) {
      matched.push("spot_only");
    }
    if (!this.config.allowLeverage) {
      matched.push("no_leverage");
    }
    if (!this.config.allowDerivatives) {
      matched.push("no_derivatives");
    }
    if (!this.config.allowPredictionMarkets) {
      matched.push("no_prediction_markets");
    }
    if (!this.config.allowInterestBearing) {
      matched.push("no_interest_bearing");
    }

    const text = `${asset.name} ${asset.symbol} ${JSON.stringify(asset.metadata)}`.toLowerCase();
    const hits = this.config.prohibitedKeywords.filter((k) => text.includes(k.toLowerCase()));
    if (hits.length > 0 && !this.config.allowProhibitedBusiness) {
      matched.push("prohibited_keywords");
      reasons.push(`Prohibited activity keywords detected: ${hits.join(", ")}`);
      const assessment = this.result(asset, "REJECTED", reasons, matched);
      events.push(
        createEvent("POLICY_REJECTED", reasons[0]!, {
          mint: asset.mint,
          payload: { hits },
          configVersions: { policy: this.config.version },
        }),
      );
      return { assessment, events };
    }

    // Uncertainty → MANUAL_REVIEW
    if (asset.liquidityUsd == null || asset.marketCapUsd == null) {
      matched.push("uncertain_data");
      reasons.push("Insufficient market data for confident policy approval");
      return {
        assessment: this.result(asset, "MANUAL_REVIEW", reasons, matched),
        events,
      };
    }

    reasons.push("Passed deterministic policy hard rules (not a religious ruling)");
    return {
      assessment: this.result(asset, "APPROVED", reasons, matched),
      events,
    };
  }

  private result(
    asset: CandidateAsset,
    decision: PolicyAssessment["decision"],
    reasons: string[],
    matchedRules: string[],
  ): PolicyAssessment {
    return {
      mint: asset.mint,
      decision,
      reasons,
      matchedRules,
      configVersion: this.config.version,
      assessedAt: nowIso(),
    };
  }
}
