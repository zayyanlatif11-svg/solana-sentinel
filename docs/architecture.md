# Architecture

Monorepo (`pnpm` workspaces) with `apps/web` (Next.js App Router dashboard), `apps/worker` (batch research cycles), and `packages/*` domain libraries.

## Data flow

1. **Discovery** pulls trending candidates from MarketDataProvider (Birdeye if keyed, else DEMO).
2. Each candidate is Zod-validated (`CandidateAssetSchema`); malformed rows emit `TOKEN_REJECTED`.
3. **Token-risk** scores mint authorities, liquidity, concentration, age, Token-2022 flags.
4. **Policy engine** applies spot-only / keyword / list rules → APPROVED | REJECTED | MANUAL_REVIEW.
5. **Signals** compute modular deterministic features; **scoring** blends versioned weights.
6. **Research agent** (optional LLM, else mock) synthesizes a brief; injection patterns → low confidence.
7. **Risk engine** enforces capital, exposure, drawdown, liquidity, slippage, cooldowns.
8. **Execution** requests Jupiter Swap API v1 `/quote` (or demo fallback) and builds a non-broadcast plan.
9. **Paper trading** simulates fill realism and writes provenance-rich orders/positions.
10. **Experiments** replay equity vs SOL/BTC/cash/mechanical baselines with metric warnings.

## Persistence

`supabase/migrations` defines Postgres tables. Runtime default is `@sat/database` in-memory store clearly labeled in UI/health.

## Safety

`getOperatingMode()` remaps `LIVE` → `PAPER`. Execution plans set `canBroadcast: false`.
