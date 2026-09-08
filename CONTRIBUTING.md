# Contributing

1. Use Node 20+ and pnpm 10+.
2. Keep LIVE trading disabled unless explicitly designing gated stubs.
3. Validate untrusted inputs with Zod.
4. Prefer deterministic engines for risk/policy/signals.
5. Add Vitest coverage for rejection paths and safety gates.
6. Do not commit secrets.
7. Update docs when changing config versions (`strategy-v1`, `risk-v1`, `policy-v1`, `token-risk-v1.5`).

```bash
pnpm install
pnpm exec vitest run
pnpm lint
pnpm --filter @sat/web run build
pnpm exec playwright test
```
