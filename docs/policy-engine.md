# Policy engine

User-configured restriction layer (`policy-v1`). **Not a fatwa authority.**

Decisions: `APPROVED` | `REJECTED` | `MANUAL_REVIEW`.

Defaults: spot only; no interest-bearing yield; no leverage/margin/derivatives/prediction markets; prohibited keyword scan; whitelist/blacklist/manual-review lists.

Uncertainty (missing liquidity/mcap) → `MANUAL_REVIEW`.
LLM output cannot override policy decisions.
