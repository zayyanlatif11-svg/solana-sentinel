import type { OnChainRiskInput } from "@sat/token-risk";
import { getDemoCandidates } from "@sat/shared";

export interface OnChainProvider {
  readonly name: string;
  readonly isDemo: boolean;
  getTokenRiskInputs(mint: string): Promise<OnChainRiskInput>;
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** Conservative unknown profile — never pretend mint/freeze authorities are revoked. */
export const UNKNOWN_ONCHAIN_RISK: OnChainRiskInput = {
  tokenProgram: "UNKNOWN",
  mintAuthority: null,
  freezeAuthority: null,
  permanentDelegate: null,
  transferRestrictions: null,
  topHolderConcentrationPct: null,
  exitLiquidityUsd: null,
  estimatedPriceImpactPct: null,
  metadataQuality: null,
};

function authorityEnabled(value: unknown): boolean | null {
  if (value === undefined) return null;
  if (value === null || value === "") return false;
  return true;
}

function combineAuthority(
  fromTokenInfo: boolean | null,
  hintedByAuthorities: boolean,
): boolean | null {
  if (fromTokenInfo === true || hintedByAuthorities) return true;
  if (fromTokenInfo === false) return false;
  return null;
}

export class DemoOnChainProvider implements OnChainProvider {
  readonly name = "demo-onchain";
  readonly isDemo = true;

  async getTokenRiskInputs(mint: string): Promise<OnChainRiskInput> {
    const demo = getDemoCandidates().find((c) => c.mint === mint);
    if (!demo) return { ...UNKNOWN_ONCHAIN_RISK };
    if (demo.symbol === "SCAMX") {
      return {
        tokenProgram: "TOKEN_2022",
        mintAuthority: true,
        freezeAuthority: true,
        permanentDelegate: true,
        transferRestrictions: true,
        topHolderConcentrationPct: 92,
        exitLiquidityUsd: 3_000,
        estimatedPriceImpactPct: 18,
        metadataQuality: 0.2,
      };
    }
    return {
      tokenProgram: "TOKEN",
      mintAuthority: false,
      freezeAuthority: false,
      permanentDelegate: false,
      transferRestrictions: false,
      topHolderConcentrationPct: 28,
      exitLiquidityUsd: demo.liquidityUsd ?? 1_000_000,
      estimatedPriceImpactPct: 0.35,
      metadataQuality: 0.85,
    };
  }
}

/**
 * Helius DAS adapter using official getAsset JSON-RPC.
 * Docs: https://www.helius.dev/docs/api-reference/das/getasset
 * Mint/freeze authority live on token_info (not authorities[].type).
 */
export class HeliusOnChainProvider implements OnChainProvider {
  readonly name = "helius";
  readonly isDemo = false;

  constructor(
    private readonly apiKey: string,
    private readonly rpcUrl?: string,
    private readonly fallback = new DemoOnChainProvider(),
  ) {}

  private endpoint(): string {
    return (
      this.rpcUrl ??
      process.env.HELIUS_RPC_URL ??
      `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`
    );
  }

  async getTokenRiskInputs(mint: string): Promise<OnChainRiskInput> {
    try {
      const res = await fetch(this.endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "sat-getAsset",
          method: "getAsset",
          params: {
            id: mint,
            options: { showFungible: true },
          },
        }),
      });
      if (!res.ok) throw new Error(`Helius HTTP ${res.status}`);
      const json = (await res.json()) as {
        result?: {
          token_info?: {
            token_program?: string;
            decimals?: number;
            supply?: number;
            mint_authority?: string | null;
            freeze_authority?: string | null;
            price_info?: { price_per_token?: number };
          };
          authorities?: Array<{ type?: string; address?: string; scopes?: string[] }>;
          content?: { metadata?: { name?: string; symbol?: string } };
        };
        error?: { message?: string };
      };
      if (json.error || !json.result) throw new Error(json.error?.message ?? "no result");

      const program = json.result.token_info?.token_program;
      let tokenProgram: OnChainRiskInput["tokenProgram"] = "UNKNOWN";
      if (program === TOKEN_PROGRAM) tokenProgram = "TOKEN";
      if (program === TOKEN_2022_PROGRAM) tokenProgram = "TOKEN_2022";

      const authorities = json.result.authorities ?? [];
      const authorityBlob = authorities
        .map((a) => `${a.type ?? ""} ${(a.scopes ?? []).join(" ")}`)
        .join(" ")
        .toLowerCase();
      const hintedMint = /\bmint\b/.test(authorityBlob);
      const hintedFreeze = /\bfreeze\b/.test(authorityBlob);

      const meta = json.result.content?.metadata;
      const metadataQuality = meta?.name && meta?.symbol ? 0.8 : 0.3;

      return {
        tokenProgram,
        mintAuthority: combineAuthority(
          authorityEnabled(json.result.token_info?.mint_authority),
          hintedMint,
        ),
        freezeAuthority: combineAuthority(
          authorityEnabled(json.result.token_info?.freeze_authority),
          hintedFreeze,
        ),
        permanentDelegate: null,
        transferRestrictions: null,
        topHolderConcentrationPct: null,
        exitLiquidityUsd: null,
        estimatedPriceImpactPct: null,
        metadataQuality,
      };
    } catch {
      // Never substitute a synthetic "clean" profile for unknown mints — that understates risk.
      const knownDemo = getDemoCandidates().some((c) => c.mint === mint);
      if (knownDemo) return this.fallback.getTokenRiskInputs(mint);
      return { ...UNKNOWN_ONCHAIN_RISK };
    }
  }
}

export function createOnChainProvider(): OnChainProvider {
  const key = process.env.HELIUS_API_KEY;
  if (key) return new HeliusOnChainProvider(key);
  return new DemoOnChainProvider();
}

/** Lightweight Solana helpers — @solana/kit preferred for future RPC work. */
export const KNOWN_PROGRAMS = {
  TOKEN: TOKEN_PROGRAM,
  TOKEN_2022: TOKEN_2022_PROGRAM,
} as const;
