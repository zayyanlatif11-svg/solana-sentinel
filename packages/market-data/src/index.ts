import {
  type CandidateAsset,
  CandidateAssetSchema,
  getDemoCandidates,
  USDC,
  nowIso,
} from "@sat/shared";

export interface MarketDataProvider {
  readonly name: string;
  readonly isDemo: boolean;
  listTrending(limit?: number): Promise<CandidateAsset[]>;
  getAsset(mint: string): Promise<CandidateAsset | null>;
  getBenchmarkPrices?(): Promise<{ solUsd: number; btcUsd: number | null }>;
}

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly name = "demo";
  readonly isDemo = true;

  async listTrending(limit = 20): Promise<CandidateAsset[]> {
    return getDemoCandidates().slice(0, limit);
  }

  async getAsset(mint: string): Promise<CandidateAsset | null> {
    return getDemoCandidates().find((c) => c.mint === mint) ?? null;
  }

  async getBenchmarkPrices() {
    return { solUsd: 148.2, btcUsd: 64_500 };
  }
}

/** Birdeye-compatible optional adapter — falls back gracefully. */
export class BirdeyeMarketDataProvider implements MarketDataProvider {
  readonly name = "birdeye";
  readonly isDemo = false;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.BIRDEYE_API_BASE ?? "https://public-api.birdeye.so",
    private readonly fallback = new DemoMarketDataProvider(),
  ) {}

  private headers(): HeadersInit {
    return {
      "X-API-KEY": this.apiKey,
      Accept: "application/json",
    };
  }

  async listTrending(limit = 20): Promise<CandidateAsset[]> {
    try {
      const url = `${this.baseUrl}/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=${limit}`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new Error(`Birdeye HTTP ${res.status}`);
      const json = (await res.json()) as {
        data?: { tokens?: Array<Record<string, unknown>> };
      };
      const tokens = json.data?.tokens ?? [];
      const out: CandidateAsset[] = [];
      for (const t of tokens) {
        const parsed = CandidateAssetSchema.safeParse({
          mint: String(t.address ?? t.mint ?? ""),
          symbol: String(t.symbol ?? "UNK"),
          name: String(t.name ?? t.symbol ?? "Unknown"),
          timestamp: nowIso(),
          priceUsd: num(t.price),
          marketCapUsd: num(t.mc ?? t.marketCap),
          liquidityUsd: num(t.liquidity),
          volume24hUsd: num(t.v24hUSD ?? t.volume24hUSD),
          volumeChange24hPct: num(t.v24hChangePercent),
          priceChange1hPct: num(t.priceChange1hPercent),
          priceChange24hPct: num(t.priceChange24hPercent),
          priceChange7dPct: num(t.priceChange7dPercent),
          tokenAgeHours: null,
          holderCount: null,
          decimals: num(t.decimals),
          metadata: { provider: "birdeye" },
          dataSources: ["birdeye"],
          riskFlags: [],
          isDemo: false,
        });
        if (parsed.success) out.push(parsed.data);
      }
      return out.length ? out : this.fallback.listTrending(limit);
    } catch {
      return this.fallback.listTrending(limit);
    }
  }

  async getAsset(mint: string): Promise<CandidateAsset | null> {
    try {
      const url = `${this.baseUrl}/defi/token_overview?address=${mint}`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new Error(`Birdeye HTTP ${res.status}`);
      const json = (await res.json()) as { data?: Record<string, unknown> };
      const t = json.data;
      if (!t) return this.fallback.getAsset(mint);
      const parsed = CandidateAssetSchema.safeParse({
        mint,
        symbol: String(t.symbol ?? "UNK"),
        name: String(t.name ?? "Unknown"),
        timestamp: nowIso(),
        priceUsd: num(t.price),
        marketCapUsd: num(t.mc),
        liquidityUsd: num(t.liquidity),
        volume24hUsd: num(t.v24hUSD),
        volumeChange24hPct: num(t.v24hChangePercent),
        priceChange1hPct: num(t.priceChange1hPercent),
        priceChange24hPct: num(t.priceChange24hPercent),
        priceChange7dPct: num(t.priceChange7dPercent),
        tokenAgeHours: null,
        holderCount: num(t.holder),
        decimals: num(t.decimals),
        metadata: { provider: "birdeye" },
        dataSources: ["birdeye"],
        riskFlags: [],
        isDemo: false,
      });
      return parsed.success ? parsed.data : this.fallback.getAsset(mint);
    } catch {
      return this.fallback.getAsset(mint);
    }
  }
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function createMarketDataProvider(): MarketDataProvider {
  const key = process.env.BIRDEYE_API_KEY;
  if (key) return new BirdeyeMarketDataProvider(key);
  return new DemoMarketDataProvider();
}

export { USDC };
