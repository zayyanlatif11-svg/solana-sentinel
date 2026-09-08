# Token risk

Deterministic assessor (`token-risk-v1`) producing:

- `riskScore` 0–100
- `riskTier`: `LOWER_RISK` | `ELEVATED_RISK` | `HIGH_RISK` | `INSUFFICIENT_DATA`
- `riskFlags[]`, `riskReasons[]`, `dataConfidence`

**Never emits “SAFE”.**

Factors include token program, mint/freeze authority, Token-2022 permanent delegate / transfer restrictions, holder concentration, liquidity, exit liquidity, age, metadata quality, price impact, and missing data penalties.
