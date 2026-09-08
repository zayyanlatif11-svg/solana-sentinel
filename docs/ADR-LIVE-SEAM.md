# ADR: Future LIVE execution seam

Status: accepted for V1.5. **LIVE remains disabled.**

## Decision

Paper/DEMO V1.5 keeps broadcast impossible:

- `isLiveTradingAllowed()` hard-returns `false`
- `ExecutionPlanSchema.canBroadcast` is `z.literal(false)` and **parsed at runtime** on every `plan()`
- No wallet, seed, `sendTransaction`, or Jupiter `POST /swap` submit path exists
- `OPERATING_MODE=LIVE` remaps to `PAPER`

A future LIVE path, if ever independently reviewed, MUST NOT be a one-line flip of `isLiveTradingAllowed`. Required architecture:

1. Separate execution service (own process / network boundary), not the Next.js dashboard process.
2. Runtime `ExecutionPlanSchema.parse` at that service boundary (already done on the plan object).
3. Config quorum: env + signed config + operator acknowledgement — not a single boolean.
4. `PLAN_CREATED` system event with a content hash of the plan.
5. Signer isolation: keys never in the research/API process, never in the browser, never in LLM context.

Do not implement any of the above in this repository until an explicit, independently reviewed program exists.
