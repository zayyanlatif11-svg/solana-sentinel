# HANDOFF — Solana Sentinel

## STATUS

**V2 PAPER/DEMO research platform** — audited V1 architecture preserved; live broadcast still hard-disabled. Postgres persistence is implemented and verified against local PostgreSQL 16 when `DATABASE_URL` is set. Default runtime without that URL remains labeled in-memory.

## WHAT WAS BUILT

- pnpm monorepo: `apps/web`, `apps/worker`, `packages/*`
- Discovery → historical/snapshot signals → token-risk v1.5 → policy → scoring → research → portfolio risk → Jupiter quote/plan → paper fill → experiments
- Next.js research terminal (DEMO/PAPER banner, `canBroadcast=false` in UI, NAV, feed, provenance, ledger)
- `PostgresDatabase` when `DATABASE_URL` is set; `InMemoryDatabase` fallback
- Vitest **66** tests + Playwright critical flow; GitHub Actions (lint, typecheck, vitest, web build, gitleaks, Playwright)
- Safety gates: LIVE remapped to PAPER; `canBroadcast: false`; `isLiveTradingAllowed()` always false; `READ_ONLY` blocks paper fills; proposal upsert-by-id; CSRF origin check on mutating POST

## WHAT ACTUALLY RUNS

| Surface | Status |
|---------|--------|
| Dashboard | `pnpm --filter @sat/web run dev` → [http://127.0.0.1:4317](http://127.0.0.1:4317) (loopback) |
| API `/api/state` | Dynamic Node route; discovery + research on cold start |
| Worker | `pnpm --filter @sat/worker run start` |
| Persistence | memory unless `DATABASE_URL` is set |
| Market data | DEMO default (Birdeye OHLCV v3 if keyed) |
| On-chain | DEMO default (Helius DAS + largest-accounts if keyed) |
| Execution | Jupiter Swap API v2 `/order` quote/route (v1 `/quote` fallback); never broadcast |
| Research LLM | Mock default |

## TEST RESULTS

See [docs/V1.5-HANDOFF.md](./docs/V1.5-HANDOFF.md) for the counts measured in this pass.

## ARCHITECTURE

See [docs/architecture.md](./docs/architecture.md) and [docs/V1.5-HANDOFF.md](./docs/V1.5-HANDOFF.md).

## SECURITY

- No wallet secrets; gitleaks in CI + `scripts/secret-scan.sh`
- Default bind 127.0.0.1; mutating POST origin/Host check
- LLM cannot override policy/risk; execution never broadcasts

## LIMITATIONS

See [docs/limitations.md](./docs/limitations.md).

## HUMAN ACTIONS

1. Review safety posture before any future LIVE design
2. Provision API keys in `.env.local` for non-demo providers
3. Set `DATABASE_URL` and apply `supabase/migrations` for durable store
4. Do **not** enable live broadcast without independent security review

---

**Mode:** PAPER · LIVE broadcasting disabled  
**Branch:** `v2-goal-mode` (merge to `main`)  
**Audit:** [docs/AUDIT-GROK.md](./docs/AUDIT-GROK.md)  
**V1.5:** [docs/V1.5-HANDOFF.md](./docs/V1.5-HANDOFF.md)
