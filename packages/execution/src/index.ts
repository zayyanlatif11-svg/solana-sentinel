import {
  type ExecutionPlan,
  type ExecutionQuote,
  USDC,
  nowIso,
  assertNotLiveBroadcast,
  isLiveTradingAllowed,
  type OperatingMode,
  ExecutionPlanSchema,
} from "@sat/shared";

export interface ExecutionProvider {
  readonly name: string;
  quote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
  }): Promise<ExecutionQuote>;
  plan(quote: ExecutionQuote, mode: OperatingMode): Promise<ExecutionPlan>;
}

const FORBIDDEN_JUPITER_PATHS = ["/execute", "/submit", "/swap/v2/execute"];

export function assertQuoteOnlyJupiterUrl(url: string): void {
  const lower = url.toLowerCase();
  for (const banned of FORBIDDEN_JUPITER_PATHS) {
    if (lower.includes(banned)) {
      throw new Error(`Forbidden Jupiter execution path: ${banned}`);
    }
  }
}

export class DemoExecutionProvider implements ExecutionProvider {
  readonly name = "demo-jupiter";

  async quote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
  }): Promise<ExecutionQuote> {
    const inAmount = params.amount;
    const outAmount = String(Math.floor(Number(inAmount) * 0.997));
    return {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inAmount,
      outAmount,
      otherAmountThreshold: String(Math.floor(Number(outAmount) * 0.99)),
      priceImpactPct: 0.12,
      slippageBps: params.slippageBps ?? 50,
      routeLabels: ["DEMO-ROUTE"],
      feeEstimateUsd: 0.05,
      provider: "demo",
      quotedAt: nowIso(),
      isDemo: true,
    };
  }

  async plan(quote: ExecutionQuote, mode: OperatingMode): Promise<ExecutionPlan> {
    assertNotLiveBroadcast(mode === "LIVE" ? "LIVE" : "PAPER");
    return ExecutionPlanSchema.parse({
      quote,
      mode: "PAPER",
      canBroadcast: false,
      notes: [
        "DEMO quote — not a live Jupiter response",
        "Broadcast disabled by safety gates",
        `Operating mode: ${mode}`,
      ],
      plannedAt: nowIso(),
    });
  }
}

function resolveQuoteEndpoint(apiBase: string): { url: string; style: "v2-order" | "v1-quote" } {
  const base = apiBase.replace(/\/$/, "");
  if (base.includes("/swap/v2")) return { url: `${base}/order`, style: "v2-order" };
  return { url: `${base}/quote`, style: "v1-quote" };
}

function labelsFromRoutePlan(raw: Record<string, unknown>): string[] {
  const plan = raw.routePlan;
  if (!Array.isArray(plan)) return [];
  return plan
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const info = (step as { swapInfo?: { label?: unknown } }).swapInfo;
      return typeof info?.label === "string" ? info.label : null;
    })
    .filter((x): x is string => Boolean(x));
}

/**
 * Jupiter quote/route adapter. Quote and plan only. Never broadcasts.
 * Default: Swap API v2 GET /swap/v2/order. Legacy: GET /swap/v1/quote.
 */
export class JupiterExecutionProvider implements ExecutionProvider {
  readonly name: string;

  constructor(
    private readonly apiBase = process.env.JUPITER_API_BASE ?? "https://api.jup.ag/swap/v2",
    private readonly apiKey = process.env.JUPITER_API_KEY,
    private readonly fallback = new DemoExecutionProvider(),
  ) {
    this.name = this.apiBase.includes("/swap/v2") ? "jupiter-v2" : "jupiter-v1";
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) h["x-api-key"] = this.apiKey;
    return h;
  }

  async quote(params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
  }): Promise<ExecutionQuote> {
    const slippageBps = params.slippageBps ?? 50;
    const attempts = [this.apiBase];
    if (!this.apiBase.includes("/swap/v1")) attempts.push("https://api.jup.ag/swap/v1");
    for (const base of attempts) {
      try {
        const { url } = resolveQuoteEndpoint(base);
        assertQuoteOnlyJupiterUrl(url);
        const qs = new URLSearchParams({
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: String(slippageBps),
        });
        const res = await fetch(`${url}?${qs}`, { headers: this.headers() });
        if (!res.ok) throw new Error(`Jupiter quote HTTP ${res.status}`);
        const raw = (await res.json()) as Record<string, unknown>;
        const outAmount = String(raw.outAmount ?? "");
        if (!outAmount) throw new Error("Jupiter quote missing outAmount");
        return {
          inputMint: String(raw.inputMint ?? params.inputMint),
          outputMint: String(raw.outputMint ?? params.outputMint),
          inAmount: String(raw.inAmount ?? params.amount),
          outAmount,
          otherAmountThreshold:
            raw.otherAmountThreshold != null ? String(raw.otherAmountThreshold) : undefined,
          priceImpactPct: raw.priceImpactPct == null ? null : Number(raw.priceImpactPct),
          slippageBps: typeof raw.slippageBps === "number" ? raw.slippageBps : slippageBps,
          routeLabels: labelsFromRoutePlan(raw),
          feeEstimateUsd: null,
          provider: "jupiter",
          raw,
          quotedAt: nowIso(),
          isDemo: false,
        };
      } catch {
        continue;
      }
    }
    return this.fallback.quote(params);
  }

  async plan(quote: ExecutionQuote, mode: OperatingMode): Promise<ExecutionPlan> {
    assertNotLiveBroadcast(mode === "LIVE" ? "LIVE" : "PAPER");
    const notes = quote.isDemo
      ? [
          "DEMO quote fallback — not a live Jupiter response",
          "Broadcast disabled by safety gates",
          `Operating mode: ${mode}`,
        ]
      : [
          `Jupiter ${this.name} quote/route only — no transaction submission`,
          "Quote and route only. On-chain submission is not implemented",
          `canBroadcast=false always; isLiveTradingAllowed=${isLiveTradingAllowed()}`,
        ];
    return ExecutionPlanSchema.parse({
      quote,
      mode: "PAPER",
      canBroadcast: false,
      notes,
      plannedAt: nowIso(),
    });
  }
}

export function createExecutionProvider(): ExecutionProvider {
  // Prefer real Jupiter quote endpoint; demo fallback inside provider
  return new JupiterExecutionProvider();
}

export { USDC };
