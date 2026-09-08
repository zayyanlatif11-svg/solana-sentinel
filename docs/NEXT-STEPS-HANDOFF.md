# NEXT-STEPS HANDOFF — Solana Agentic Trading Research Platform

Planning handoff for a follow-up model (SOL / GPT 5.6). **Plan next steps; do not treat this as an implementation brief.** Verify anything you act on against the tip commit below.

Generated from tip inspection on **2026-09-08** against branch `cursor/audit-safety-gates-d1d1`. Code/audit verification (vitest, typecheck, live `/api/state`) measured on `6bc79f6`; subsequent commits on this branch that only touch docs do not change that code tip.

---

## STATUS

**V1 PAPER/DEMO research platform — audit-hardened, not production trading.**

- Monorepo builds; vitest **36/36** pass on tip; workspace typecheck pass; `@sat/web` eslint pass; secret-scan clean.
- Demo dashboard **running** at [http://localhost:4317](http://localhost:4317) (binds `0.0.0.0:4317`).
- Live broadcast is hard-disabled (`isLiveTradingAllowed()` always `false`; `canBroadcast` schema literal `false`; no `sendTransaction` / Jupiter submit).
- Persistence is **in-memory only**; Postgres migration exists but is **not wired** at runtime.
- High audit findings (H1–H4) are fixed on this branch; residuals remain (unauth API, stub package lint, incomplete Token-2022 decode, etc.).

---

## WHAT WAS BUILT

pnpm monorepo for a Solana **agentic trading research** terminal:

| Layer | Contents |
|-------|----------|
| Apps | `apps/web` — Next.js research dashboard + `/api/state`; `apps/worker` — one-shot / batch research cycle |
| Orchestration | `@sat/pipeline` — discovery → evaluate → paper execute → demo experiments |
| Domain packages | `shared`, `database`, `solana`, `market-data`, `discovery`, `signals`, `token-risk`, `policy-engine`, `research-agent`, `risk-engine`, `portfolio`, `execution`, `paper-trading`, `analytics`, `experiments` |
| Data path | DEMO market/on-chain/research by default; optional Birdeye / Helius DAS / Jupiter quote / OpenAI-compatible LLM |
| Safety docs | `SECURITY.md`, `docs/threat-model.md`, `docs/limitations.md`, `docs/AUDIT-GROK.md` |
| Persistence | `supabase/migrations/20260325000000_init.sql` + `InMemoryDatabase` runtime |
| CI | `.github/workflows/ci.yml` — web lint, full typecheck, vitest, secret-scan |

Product posture: **READ_ONLY + PAPER ONLY**. Not investment advice. Risk tiers never use the label “SAFE”.

---

## WHAT ACTUALLY RUNS

### Start dashboard (verified default)

```bash
pnpm install
cp .env.example .env.local   # optional credentials
pnpm --filter @sat/web run dev -- --port 4317
# package.json already: next dev --turbopack --port 4317 --hostname 0.0.0.0
```

Open [http://localhost:4317](http://localhost:4317).

### Other commands

```bash
pnpm exec vitest run                 # unit + integration
pnpm run typecheck                   # all packages + apps
pnpm --filter @sat/web run lint      # real eslint (web only)
pnpm --filter @sat/web run build
pnpm --filter @sat/worker run start  # one-shot research pass
bash scripts/secret-scan.sh          # pattern scan; ignores *.md
```

### Runtime surfaces (observed on this environment)

| Surface | Behavior |
|---------|----------|
| `GET /api/state` | Cold-starts discovery + research if empty; returns store + `health` |
| `POST /api/state` | Actions: `discover`, `research_pass`, `evaluate`, `paper_execute`, `experiment`, `reset` — **unauthenticated** |
| Persistence | `health.persistence: "memory"`; resets on process restart |
| Providers (default) | market `demo`, onchain `demo-onchain`, execution `jupiter-v1` (quote), research `mock` |
| Port | **4317**, hostname **0.0.0.0** |

---

## BRANCH / SOURCE OF TRUTH

**Use `cursor/audit-safety-gates-d1d1` as the planning and implementation base.**

| Ref | Tip (at handoff write) | Relation |
|-----|------------------------|----------|
| `cursor/audit-safety-gates-d1d1` | `6bc79f6` — *fix(audit): paper-execute gates, Helius risk fallback, adapter honesty* | **Newest tip; contains QA + audit fixes** |
| `cursor/final-qa-fixes-6a3e` | `6759271` | Ancestor of audit branch; QA typecheck + hard-false live gate; **missing audit fixes** |
| `main` | `9fff0f0` | Ancestor of both; **4 commits behind** audit tip |

Lineage (verified):

```text
main (9fff0f0)
  └─ QA (f7e5bec … 6759271)     ← isLiveTradingAllowed hard-false, typecheck fixes
       └─ audit (6bc79f6)        ← H1–H4 + M1–M4 fixes; 31→36 tests; AUDIT-GROK.md
```

- `main` is an ancestor of HEAD; HEAD is **not** merged to `main`.
- Audit branch is **1 commit ahead** of QA and includes all important paper-execute / Helius / test honesty fixes.
- Do **not** plan from `main` or QA alone if you need post-audit safety behavior.

Related docs on tip: root `HANDOFF.md`, `docs/AUDIT-GROK.md`, this file.

---

## VERIFICATION SNAPSHOT

Re-run on tip before trusting older handoffs. Numbers below were measured on **`6bc79f6`** during this handoff pass:

| Check | Result |
|-------|--------|
| `pnpm exec vitest run` | **5 files, 36 tests passed** |
| `pnpm run typecheck` | **pass** (all packages + apps) |
| `pnpm --filter @sat/web run lint` | **pass** (`--max-warnings 0`) |
| `bash scripts/secret-scan.sh` | **clean** (exit 0; pattern scan only) |
| Demo server | Listening `0.0.0.0:4317` (`next-server`) |
| `GET /api/state` → `health` | `liveTradingAllowed: false`, `canBroadcast: false`, `persistence: "memory"`, `demoMode: true`, 8 DEMO candidates |
| SCAMX gates | policy `REJECTED`, token-risk `HIGH_RISK`, risk `REJECT`, proposal `REJECTED` |

Not re-verified in this handoff pass (claimed in `docs/AUDIT-GROK.md` / prior agents — re-check if planning depends on them):

- Full `pnpm --filter @sat/web run build` (Next 16.3.4 previously pass on audit)
- Interactive paper_execute API round-trip (WIF fill / re-execute block) — covered by vitest `pipeline.test.ts`
- Playwright — **not wired**

**Do not treat workspace `pnpm lint` as real coverage** — non-web packages use `echo "lint ok …"`.

---

## ARCHITECTURE MAP

End-to-end research path (orchestrated by `@sat/pipeline`):

```text
Discovery (@sat/discovery + MarketDataProvider)
    → Zod-validated candidates (CandidateAssetSchema)
    → Token-risk (@sat/token-risk + OnChainProvider / Helius or DEMO)
    → Policy (@sat/policy-engine) → APPROVED | REJECTED | MANUAL_REVIEW
    → Signals + scoring (@sat/signals)
    → Research brief (@sat/research-agent mock/LLM; injection-sanitized; cannot execute)
    → Portfolio risk (@sat/risk-engine) → APPROVE | REJECT | REDUCE_SIZE
    → TradeProposal stored in @sat/database (memory)
    → Execution quote/plan (@sat/execution Jupiter Swap API v1 /quote only; canBroadcast: false)
    → Paper fill (@sat/paper-trading) on explicit paper_execute
    → Portfolio / NAV / equity history (@sat/portfolio)
    → Experiments / baselines (@sat/experiments + @sat/analytics)
```

UI: `apps/web` dashboard (DEMO/PAPER banner, feed, provenance, ledger, events) talks only to `/api/state`.  
Worker: `apps/worker` runs the same pipeline without the UI.

---

## SAFETY MODEL

Independent gates (verify in code before any LIVE design):

1. **`getOperatingMode()`** — `LIVE` remapped to `PAPER`.
2. **`isLiveTradingAllowed()`** — hard `return false` in V1 (env unlock trio unused).
3. **`ExecutionPlanSchema.canBroadcast`** — `z.literal(false)`.
4. **No broadcast path** — no wallet/seed handling; Jupiter `POST /swap` not used for submit; no `sendTransaction`.
5. **`READ_ONLY`** — `executePaperProposal` throws; UI disables paper-trade.
6. **Execute-time re-checks** — blocks `REJECTED` / already `ACCEPTED_PAPER` / policy not APPROVED / risk REJECT / token-risk `HIGH_RISK` or `INSUFFICIENT_DATA`.
7. **Proposal upsert** — `addProposal` replaces by id; only consume proposal on `FILLED`/`PARTIAL`.
8. **Deterministic engines authoritative** — LLM cannot override policy / token-risk / portfolio risk.
9. **Demo honesty** — candidates `isDemo: true`; unknown Helius failures → `UNKNOWN`/nulls (not fake-clean); Jupiter plan notes distinguish demo quotes.

Threat: local API is open — anyone who can reach `:4317` can `reset` / `paper_execute`.

---

## AUDIT FINDINGS (fixed vs residual)

Source of detail: [`docs/AUDIT-GROK.md`](./AUDIT-GROK.md). Lightly re-verified in code where noted.

### Fixed on audit tip (must keep)

| ID | Issue | Fix location (pointers) |
|----|-------|-------------------------|
| H1 | Duplicate paper fills via clone + unshift | `packages/database` upsert-by-id; pipeline reject `ACCEPTED_PAPER`; consume only on fill |
| H2 | `READ_ONLY` did not block paper execute | `executePaperProposal` + dashboard disable |
| H3 | Helius failure → synthetic clean demo profile | unknown mint → `UNKNOWN_ONCHAIN_RISK`; demo list only for known demos |
| H4 | Wrong DAS authority fields | read `token_info.mint_authority` / `freeze_authority` |
| M1–M4 | Demo Jupiter notes; FAILED consume; weak tests; CI typecheck gap | execution notes; consume rules; tightened tests; CI `pnpm run typecheck` |

### Residual (planning backlog inputs)

| ID / theme | Residual |
|------------|----------|
| M5 | Unauthenticated `/api/state`; bind `0.0.0.0:4317` |
| M6 | Package lint stubs except `@sat/web` |
| M7 | `secret-scan.sh` regex-only; ignores `*.md`; gitleaks not in CI |
| M9 | Jupiter Swap **v1** legacy quote path (valid for quote-only) |
| L1–L8 | Unused shadcn primitives; no discover button; SCAMX = System Program mint; RS uses hardcoded +2% benchmark; synthetic experiment equity path when history short; Next memory singleton across workers; weak LLM injection regex; no Playwright |
| On-chain | Token-2022 permanent delegate / transfer hooks / holder concentration still `null` |
| Persistence | `DATABASE_URL` ignored at runtime |

---

## KNOWN LIMITATIONS & MISSING CREDENTIALS

### Limitations (product-true)

- Default path is DEMO unless keys provided; labeled fallbacks can surprise operators who think a key is “live.”
- Memory store resets on restart; Next multi-worker can split singletons in production.
- Signal features are snapshot-based (not full OHLCV histories).
- Token-2022 extension decode via Helius is partial (safer nulls, incomplete risk picture).
- Experiment UI may show labeled demo / synthetic equity paths — **not** live performance claims.
- Playwright UI automation not wired.
- Workspace `pnpm lint` is mostly stub echoes.

### Optional credentials (platform continues without them)

From `.env.example`:

- `JUPITER_API_KEY` / `JUPITER_API_BASE` (lite quote worked without key in prior audits)
- `HELIUS_API_KEY` / `HELIUS_RPC_URL`
- `BIRDEYE_API_KEY` / `BIRDEYE_API_BASE`
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `RESEARCH_MODEL`
- `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Do not commit real secrets. Prefer `.env.local` (gitignored).

---

## HUMAN ACTIONS REQUIRED

1. **Network posture** — Do not expose `:4317` on an untrusted network; prefer localhost bind or add auth before sharing demos.
2. **Credential provisioning** — Place real API keys in `.env.local` only if non-demo providers are needed; confirm Birdeye plan-tier response shapes.
3. **Postgres** — Apply `supabase/migrations` when a DB is available; runtime wiring is still missing (code change required).
4. **Safety review gate** — Independent security review before any LIVE broadcast design; do **not** flip `isLiveTradingAllowed()`.
5. **Merge policy** — Decide when/whether to merge `cursor/audit-safety-gates-d1d1` → `main` (currently 4 commits ahead, unmerged).
6. **Optional** — Playwright smoke ownership; gitleaks-in-CI ownership; real package lint ownership.

---

## SUGGESTED NEXT-STEP THEMES

Prioritized backlog **themes** for planning (not an implementation checklist). Each theme lists dependencies and risks. **No calendar estimates.**

### P0 — Safety / honesty before surface area growth

1. **Local API hardening**  
   - Theme: bind localhost by default **or** add minimal auth / CSRF for mutating POST actions; document threat clearly in UI.  
   - Depends on: product decision (local-only vs shared demo).  
   - Risk: skipping this while adding remote deploy = trivial paper-state abuse / reset.

2. **Preserve audit invariants in CI**  
   - Theme: keep tests for re-execute block, READ_ONLY block, SCAMX multi-gate, Helius unknown-mint fallback, `isLiveTradingAllowed` hard-false.  
   - Depends on: current vitest suite.  
   - Risk: regressions silently reintroduce duplicate fills or fake-clean on-chain profiles.

3. **Do not enable LIVE**  
   - Theme: any LIVE work is a separate gated program (wallet, broadcast, Jupiter submit, multi-party unlock, independent review).  
   - Depends on: none for “keep disabled.”  
   - Risk: env-unlock docs tempt premature flips; code currently hard-false — keep it that way.

### P1 — Persistence & operability

4. **Wire Postgres when `DATABASE_URL` is set**  
   - Theme: implement real `Database` behind the interface; keep memory fallback labeled.  
   - Depends on: migration review, Supabase/Postgres availability, singleton/process model for Next.  
   - Risk: half-wired DB + memory split; multi-instance Next without shared store.

5. **Real lint + secret scanning**  
   - Theme: replace package `echo` lint or drop scripts; run gitleaks (or equivalent) in CI; stop implying workspace lint is meaningful.  
   - Depends on: eslint config strategy across packages.  
   - Risk: low immediate exploit risk; high process/honesty risk.

### P2 — Data quality for research claims

6. **Historical market bars**  
   - Theme: ingest real windows for momentum/vol/RS instead of snapshot heuristics / hardcoded +2% benchmark.  
   - Depends on: Birdeye (or other) historical APIs + credentials + rate limits.  
   - Risk: overclaiming signal quality while still on snapshots.

7. **Deeper on-chain / Token-2022 decode**  
   - Theme: holder concentration, permanent delegate, transfer hooks — prefer `null`/`INSUFFICIENT_DATA` over guesses.  
   - Depends on: Helius DAS/RPC capabilities; careful schema mapping (H4 lesson).  
   - Risk: wrong field mapping understates risk again.

8. **Jupiter quote path currency**  
   - Theme: evaluate Swap API v2 when going beyond quotes; keep quote-only / no-submit invariant.  
   - Depends on: execution package; no broadcast requirement.  
   - Risk: conflating “newer quote API” with “live trading ready.”

### P3 — Product / UX / verification

9. **Playwright smoke in CI**  
   - Theme: load `/`, research pass, SCAMX rejected, paper-trade APPROVED mint, assert DEMO banner + `canBroadcast` false.  
   - Depends on: stable demo selectors; CI browser install.  
   - Risk: flaky UI tests vs high value for safety regressions.

10. **Experiment honesty UX**  
    - Theme: make synthetic/demo equity paths unmistakably non-performance; avoid misread vs strategy %.  
    - Depends on: experiments + dashboard.  
    - Risk: resume/marketing misuse of demo charts.

11. **Merge audit tip to main**  
    - Theme: after human review of AUDIT-GROK + this handoff, land safety fixes on default branch.  
    - Depends on: human merge decision.  
    - Risk: forks from `main` miss H1–H4.

### Explicit non-goals for near-term planning

- Leverage, margin, perps, options, prediction markets.
- Seed phrases / client-side keys.
- Treating mock LLM confidence as an execution authority.
- Claiming profitable live performance from DEMO/PAPER runs.

---

## DO NOT CLAIM

Anti-fabrication list for the follow-up planner and any downstream docs:

- Do **not** claim live trading, broadcast, or wallet custody.
- Do **not** claim Postgres persistence is active (migration ≠ runtime).
- Do **not** claim workspace `pnpm lint` linted all packages.
- Do **not** claim Playwright coverage exists.
- Do **not** claim Token-2022 / holder risk is complete when fields are `null`.
- Do **not** claim Birdeye/Helius/OpenAI are live unless keys are present **and** adapters are not on demo fallback (check `isDemo` / provider health).
- Do **not** claim Jupiter v1 quote implies submission capability.
- Do **not** claim `isLiveTradingAllowed()` can be unlocked via env in V1 (hard-false).
- Do **not** invent test counts — re-run `pnpm exec vitest run` (currently **36**).
- Do **not** plan from `main` as if it includes audit fixes.
- Do **not** treat experiment / sine-wave / short demo equity as verified strategy performance.
- Do **not** estimate calendar days/weeks for themes; scope by components, invasiveness, and dependencies instead.

---

## KEY FILE POINTERS

| Concern | Path |
|---------|------|
| Root handoff (ops summary) | `HANDOFF.md` |
| This planning handoff | `docs/NEXT-STEPS-HANDOFF.md` |
| Adversarial audit | `docs/AUDIT-GROK.md` |
| Architecture / flow | `docs/architecture.md`, `README.md` |
| Security / threats / limits | `SECURITY.md`, `docs/threat-model.md`, `docs/limitations.md` |
| Env template | `.env.example` |
| Pipeline orchestration | `packages/pipeline/src/index.ts` |
| Live gate | `packages/shared/src/schemas.ts` (`isLiveTradingAllowed`) |
| Memory DB + upsert | `packages/database/src/index.ts` |
| Jupiter quote/plan | `packages/execution/src/index.ts` |
| Helius / DEMO on-chain | `packages/solana/src/index.ts` |
| Paper engine | `packages/paper-trading/src/index.ts` |
| HTTP API | `apps/web/src/app/api/state/route.ts` |
| Dashboard UI | `apps/web/src/app/page.tsx` |
| Worker entry | `apps/worker/src/index.ts` |
| SQL migration | `supabase/migrations/20260325000000_init.sql` |
| Tests | `tests/*.test.ts` (esp. `pipeline.test.ts`, `integration.test.ts`) |
| CI | `.github/workflows/ci.yml` |
| Demo screenshot | `docs/screenshots/dashboard-demo.png` |

---

**Demo URL:** [http://localhost:4317](http://localhost:4317)  
**Mode:** PAPER · LIVE broadcasting disabled  
**Source of truth branch:** `cursor/audit-safety-gates-d1d1`  
**Verified audit code tip:** `6bc79f6f002cda890b5114b3c848fcf93375e8ce`  
**This handoff commit:** see `git log -1 -- docs/NEXT-STEPS-HANDOFF.md` on the branch (docs-only; same code as verified tip)  
**Follow-up role:** plan next steps from this document; re-verify commands before implementation.
