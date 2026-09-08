# SAT Research — Solana Agentic Trading Research Platform

**READ_ONLY + PAPER ONLY.** Live swap broadcasting is hard-disabled.

Professional research terminal for Solana asset discovery, deterministic signals, explainable token-risk, configurable policy checks, bounded LLM research, portfolio risk gates, Jupiter quote/plan (no broadcast), and realistic paper execution with full decision provenance.

> Not investment advice. Not a fatwa authority. Risk tiers never use the label “SAFE”.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ apps/web (Next.js dashboard)     apps/worker (batch cycles)     │
└───────────────┬───────────────────────────┬─────────────────────┘
                │                           │
                ▼                           ▼
         packages/pipeline (orchestrator) ─────────────┐
                │                                      │
    ┌───────────┼────────────┬─────────────┬───────────┼──────────┐
    ▼           ▼            ▼             ▼           ▼          ▼
 discovery  signals   token-risk   policy-engine  risk-engine  research
    │           │            │             │           │          │
    └───────────┴────────────┴──────┬──────┴───────────┴──────────┘
                                    ▼
                     execution (Jupiter quote/plan)
                                    ▼
                          paper-trading + portfolio
                                    ▼
                     analytics + experiments + database
```

## Quick start

```bash
pnpm install
cp .env.example .env.local   # optional credentials
pnpm --filter @sat/web run dev -- --port 4317
```

Open [http://localhost:4317](http://localhost:4317). Demo data is labeled in the UI banner.

```bash
pnpm exec vitest run          # unit + integration
pnpm --filter @sat/web run build
pnpm --filter @sat/worker run start
```

## Operating modes

| Mode | Behavior |
|------|----------|
| `DEMO` | In-memory demo market data + mock research |
| `PAPER` | Quotes may hit Jupiter; fills are simulated only |
| `READ_ONLY` | Research without paper fills |
| `LIVE` | **Remapped to PAPER** — broadcast requires multi-gate unlock that is not enabled |

Gates for any future live work (still not implemented for broadcast):
`ALLOW_LIVE_TRADING=true` + `OPERATING_MODE=LIVE` + `LIVE_BROADCAST_UNLOCK=I_UNDERSTAND_THE_RISKS`.

## Environment variables

See [`.env.example`](./.env.example). Optional: `JUPITER_API_KEY`, `HELIUS_API_KEY`, `BIRDEYE_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`. Missing credentials → labeled DEMO/mock adapters.

## Packages

| Package | Role |
|---------|------|
| `@sat/shared` | Zod schemas, defaults, demo assets, safety helpers |
| `@sat/market-data` | MarketDataProvider (Birdeye + DEMO) |
| `@sat/solana` | OnChainProvider (Helius DAS getAsset + DEMO) |
| `@sat/discovery` | Candidate discovery + Zod validation |
| `@sat/signals` | Momentum/volume/liquidity/RS/vol/regime/on-chain |
| `@sat/token-risk` | Deterministic risk score/tiers/flags |
| `@sat/policy-engine` | APPROVED / REJECTED / MANUAL_REVIEW |
| `@sat/research-agent` | Bounded LLM / mock + injection guards |
| `@sat/risk-engine` | Portfolio risk APPROVE/REJECT/REDUCE_SIZE |
| `@sat/execution` | Jupiter Swap API v1 quote/plan, never broadcast |
| `@sat/paper-trading` | Spread/slippage/impact/latency/partial/fail model |
| `@sat/portfolio` | NAV, sizing helpers |
| `@sat/analytics` | Returns, Sharpe/Sortino w/ sample warnings |
| `@sat/experiments` | Replay vs SOL/BTC/cash/mechanical baselines |
| `@sat/database` | In-memory store + Postgres migrations |
| `@sat/pipeline` | End-to-end orchestration |

## Safety

- No seed phrases / wallet secrets
- No live transaction broadcast
- No leverage, margin, perps, options, prediction markets
- LLM cannot override policy/risk/portfolio
- External text treated as UNTRUSTED

See [SECURITY.md](./SECURITY.md) and [docs/threat-model.md](./docs/threat-model.md).

## Docs

- [Architecture](./docs/architecture.md)
- [Methodology](./docs/methodology.md)
- [Token risk](./docs/token-risk.md)
- [Policy engine](./docs/policy-engine.md)
- [Risk engine](./docs/risk-engine.md)
- [Paper trading](./docs/paper-trading.md)
- [Experiments](./docs/experiments.md)
- [Limitations](./docs/limitations.md)
- [Resume notes](./docs/resume-project-notes.md)
- [Handoff](./HANDOFF.md)

## Screenshots / demo

Run the dashboard locally; the first viewport shows **SAT Research** branding, DEMO/PAPER banner, NAV, opportunity feed, and provenance panels.

## Roadmap

1. Wire Supabase persistence when `DATABASE_URL` present
2. Richer Helius holder distribution + Token-2022 extension decode
3. Historical bar ingestion for robust signal windows
4. Playwright smoke tests in CI
5. Optional hardware-wallet LIVE path behind additional human gates (not this release)

## License

Private research prototype — use at your own risk.
