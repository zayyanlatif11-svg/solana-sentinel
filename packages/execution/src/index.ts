import {
  type ExecutionPlan,
  type ExecutionQuote,
  USDC,
  nowIso,
  assertNotLiveBroadcast,
  isLiveTradingAllowed,
  type OperatingMode,
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
    return {
      quote,
      mode: "PAPER",
      canBroadcast: false,
      notes: [
        "DEMO quote — not a live Jupiter response",
        "Broadcast disabled by safety gates",
        `Operating mode: ${mode}`,
      ],
      plannedAt: nowIso(),
    };
  }
}

/**
 * Jupiter Swap API v1 adapter (quote + plan only; never broadcasts).
 * Lite: https://lite-api.jup.ag/swap/v1
 * Pro:  https://api.jup.ag/swap/v1
 * Docs: https://dev.jup.ag/docs/api-reference/swap/v1/quote
 */
export class JupiterExecutionProvider implements ExecutionProvider {
  readonly name = "jupiter-v1";

  constructor(
    private readonly apiBase = process.env.JUPITER_API_BASE ?? "https://lite-api.jup.ag/swap/v1",
    private readonly apiKey = process.env.JUPITER_API_KEY,
    private readonly fallback = new DemoExecutionProvider(),
  ) {}

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
    try {
      const slippageBps = params.slippageBps ?? 50;
      const qs = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps: String(slippageBps),
      });
      const res = await fetch(`${this.apiBase}/quote?${qs}`, {
        headers: this.headers(),
      });
      if (!res.ok) throw new Error(`Jupiter quote HTTP ${res.status}`);
      const raw = (await res.json()) as {
        inputMint: string;
        outputMint: string;
        inAmount: string;
        outAmount: string;
        otherAmountThreshold?: string;
        priceImpactPct?: string | number;
        slippageBps?: number;
        routePlan?: Array<{ swapInfo?: { label?: string } }>;
      };
      const routeLabels =
        raw.routePlan
          ?.map((r) => r.swapInfo?.label)
          .filter((x): x is string => Boolean(x)) ?? [];
      return {
        inputMint: raw.inputMint,
        outputMint: raw.outputMint,
        inAmount: raw.inAmount,
        outAmount: raw.outAmount,
        otherAmountThreshold: raw.otherAmountThreshold,
        priceImpactPct:
          raw.priceImpactPct == null ? null : Number(raw.priceImpactPct),
        slippageBps: raw.slippageBps ?? slippageBps,
        routeLabels,
        feeEstimateUsd: null,
        provider: "jupiter",
        raw,
        quotedAt: nowIso(),
        isDemo: false,
      };
    } catch {
      return this.fallback.quote(params);
    }
  }

  async plan(quote: ExecutionQuote, mode: OperatingMode): Promise<ExecutionPlan> {
    // Hard gate: never broadcast. LIVE stub only if multi-gate unlocked (still no broadcast).
    if (mode === "LIVE" && !isLiveTradingAllowed()) {
      assertNotLiveBroadcast("LIVE");
    }
    return {
      quote,
      mode: "PAPER",
      canBroadcast: false,
      notes: [
        "Jupiter quote/plan only — serialized swap is NOT requested for broadcast",
        "POST /swap is intentionally not used for live submission in this platform",
        `canBroadcast=false always; isLiveTradingAllowed=${isLiveTradingAllowed()}`,
      ],
      plannedAt: nowIso(),
    };
  }
}

export function createExecutionProvider(): ExecutionProvider {
  // Prefer real Jupiter quote endpoint; demo fallback inside provider
  return new JupiterExecutionProvider();
}

export { USDC };
