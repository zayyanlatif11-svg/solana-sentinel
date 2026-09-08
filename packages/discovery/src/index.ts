import {
  CandidateAssetSchema,
  type CandidateAsset,
  getDemoCandidates,
  createEvent,
  type SystemEvent,
} from "@sat/shared";
import type { MarketDataProvider } from "@sat/market-data";

export interface DiscoveryResult {
  candidates: CandidateAsset[];
  events: SystemEvent[];
  mode: "live-provider" | "demo";
}

export class DiscoveryService {
  constructor(private readonly market: MarketDataProvider) {}

  async discover(limit = 20): Promise<DiscoveryResult> {
    const events: SystemEvent[] = [];
    try {
      const raw = await this.market.listTrending(limit);
      const candidates: CandidateAsset[] = [];
      for (const item of raw) {
        const parsed = CandidateAssetSchema.safeParse(item);
        if (!parsed.success) {
          events.push(
            createEvent("TOKEN_REJECTED", "Malformed candidate rejected by Zod", {
              payload: { issues: parsed.error.issues.slice(0, 5) },
            }),
          );
          continue;
        }
        candidates.push(parsed.data);
        events.push(
          createEvent("TOKEN_DISCOVERED", `Discovered ${parsed.data.symbol}`, {
            mint: parsed.data.mint,
            payload: { symbol: parsed.data.symbol, isDemo: parsed.data.isDemo },
          }),
        );
      }
      return {
        candidates,
        events,
        mode: candidates.some((c) => !c.isDemo) ? "live-provider" : "demo",
      };
    } catch (err) {
      events.push(
        createEvent("PROVIDER_ERROR", "Market provider failed; using demo candidates", {
          payload: { error: err instanceof Error ? err.message : String(err) },
        }),
      );
      const candidates = getDemoCandidates().slice(0, limit);
      for (const c of candidates) {
        events.push(
          createEvent("TOKEN_DISCOVERED", `Demo discovered ${c.symbol}`, {
            mint: c.mint,
            payload: { symbol: c.symbol, isDemo: true },
          }),
        );
      }
      return { candidates, events, mode: "demo" };
    }
  }
}
