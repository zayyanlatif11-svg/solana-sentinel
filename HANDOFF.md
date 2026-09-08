# HANDOFF — Solana Agentic Trading Research Platform

## STATUS

**V1 PAPER/DEMO (audit-hardened)** — monorepo builds, tests pass, dashboard running, paper trade E2E verified, live broadcast hard-disabled. Persistence remains in-memory; Postgres is migration-only.

## WHAT WAS BUILT

- pnpm monorepo: `apps/web`, `apps/worker`, `packages/*` (shared, database, solana, market-data, discovery, signals, token-risk, policy-engine, research-agent, risk-engine, portfolio, execution, paper-trading, analytics, experiments, pipeline)
- Deterministic discovery → signals → token-risk → policy → scoring → research → portfolio risk → Jupiter quote/plan → paper fill → experiments
- Next.js research terminal (institutional aesthetic, DEMO banner, NAV, feed, provenance, ledger, events)
- Supabase/Postgres SQL migration + in-memory persistence fallback
- Vitest suite (36 tests), GitHub Actions CI, SECURITY + threat model + methodology docs
- Safety gates: LIVE remapped to PAPER; `canBroadcast: false`; `isLiveTradingAllowed()` always false in V1; `READ_ONLY` blocks paper fills; paper proposals upsert-by-id

## WHAT ACTUALLY RUNS

| Surface | Status |
|---------|--------|
| Dashboard | **Running** at [http://localhost:4317](http://localhost:4317) |
| API `/api/state` | Dynamic Node route; discovery + research on cold start |
| Worker | `pnpm --filter @sat/worker run start` — one-shot research pass |
| Persistence | In-memory (labeled); SQL migration ready under `supabase/migrations` |
| Market data | DEMO default (Birdeye if `BIRDEYE_API_KEY`) |
| On-chain | DEMO default (Helius DAS `getAsset` if `HELIUS_API_KEY`) |
| Execution | Jupiter Swap API v1 `/quote` via lite endpoint; demo fallback |
| Research LLM | Mock default (OpenAI-compatible if `OPENAI_API_KEY`) |

## TEST RESULTS

```text
pnpm exec vitest run
 Test Files  5 passed (5)
      Tests  36 passed (36)
```

Coverage includes: policy/token-risk/risk rejection (SCAMX asserts all three gates), signals/scoring, paper fills/stale quotes/costs, prompt-injection guard, live-mode gates (incl. unlock-env still disabled), malformed Zod rejection, pipeline E2E duplicate suppression + paper execute + re-execute blocked + READ_ONLY blocked, Helius token_info authority parse + unknown-mint fallback.

## BUILD RESULTS

```text
pnpm run typecheck                 → success (after HeadersInit / noUncheckedIndexedAccess fixes)
pnpm --filter @sat/web run build   → success (Next.js 16.3.4)
pnpm --filter @sat/web run lint    → success (eslint flat config)
bash scripts/secret-scan.sh        → clean
```

## SCREENSHOTS / DEMO

![Dashboard DEMO](./docs/screenshots/dashboard-demo.png)

Open [http://localhost:4317](http://localhost:4317).

Verified via API + headless Chrome screenshot against the running server:

- UI banner `DEMO / PAPER ONLY` + per-candidate `DEMO` pills
- DEMO candidates labeled `isDemo: true`
- `SCAMX` → policy `REJECTED` + token-risk `HIGH_RISK` + risk `REJECT`
- Paper execute on approved proposal → `FILLED`, `canBroadcast: false`, plan `mode: PAPER`; second execute on same id is rejected
- SCAMX paper execute is rejected
- `isLiveTradingAllowed()` always `false` in V1 (env unlock trio unused)
- Jupiter quote may return live lite quotes (`provider: "jupiter"`) or demo fallback; never broadcast
- Experiment `demo-paper-replay-v1` stored with baseline comparisons

## ARCHITECTURE

See [docs/architecture.md](./docs/architecture.md) and root [README.md](./README.md). Orchestration lives in `@sat/pipeline`.

## SECURITY

- No wallet secrets; `.gitignore` + `.gitleaks.toml` + `scripts/secret-scan.sh`
- [SECURITY.md](./SECURITY.md), [docs/threat-model.md](./docs/threat-model.md)
- LLM cannot override policy/risk; external text sanitized
- Execution never broadcasts

## LIMITATIONS

- Default path is DEMO market/on-chain/research unless keys provided
- Memory store resets on process restart
- Signal features are snapshot-based (not full OHLCV histories)
- Token-2022 extension decode via Helius is partial
- Experiment UI may include labeled demo equity paths — **not live performance claims**
- Playwright UI automation not wired; dashboard verified with headless Chrome screenshot
- Next.js auto-generated `AGENTS.md` / `CLAUDE.md` may appear under `apps/web`
- `isLiveTradingAllowed()` hard-returns `false` even if README unlock env vars are set
- Local `/api/state` is unauthenticated; demo server binds `0.0.0.0:4317`

## MISSING CREDENTIALS

Optional (platform continues with labeled fallbacks):

- `JUPITER_API_KEY` (lite endpoint worked without key here)
- `HELIUS_API_KEY` / `HELIUS_RPC_URL`
- `BIRDEYE_API_KEY`
- `OPENAI_API_KEY`
- `DATABASE_URL` / Supabase keys

## HUMAN ACTIONS

1. Review safety posture before any future LIVE design
2. Provision API keys in `.env.local` for non-demo providers
3. Apply `supabase/migrations` when Postgres is available
4. Add Playwright smoke tests if desired
5. Do **not** enable live broadcast without independent security review

## TOP 5 NEXT IMPROVEMENTS

1. Persist store to Postgres when `DATABASE_URL` is set
2. Full historical bar ingestion for robust signal windows
3. Deeper Token-2022 / holder distribution via Helius
4. Playwright CI smoke (dashboard + paper trade)
5. Optional hardware-wallet LIVE path behind additional human gates (explicitly out of scope for this V1)

---

**Demo URL:** [http://localhost:4317](http://localhost:4317)  
**Mode:** PAPER · LIVE broadcasting disabled  
**Branch:** `cursor/audit-safety-gates-d1d1`  
**Audit:** [docs/AUDIT-GROK.md](./docs/AUDIT-GROK.md)  
**Next-steps planning handoff:** [docs/NEXT-STEPS-HANDOFF.md](./docs/NEXT-STEPS-HANDOFF.md)
