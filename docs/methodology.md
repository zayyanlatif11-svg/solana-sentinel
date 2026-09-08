# Methodology

## Opportunity score (strategy-v1)

Weighted blend of normalized components:

| Component | Default weight |
|-----------|----------------|
| Momentum | 0.20 |
| Volume | 0.15 |
| Liquidity | 0.15 |
| Relative strength | 0.10 |
| Regime | 0.10 |
| On-chain | 0.10 |
| Risk/reward | 0.15 |
| Research | 0.05 |

Scores are explainable (`explanation[]`) and versioned. Changing weights requires a new `strategy` version string.

## Market regime

Universe average 24h change + average absolute volatility → RISK_ON / NEUTRAL / RISK_OFF / HIGH_VOLATILITY.

## What this is not

- Not alpha claims from live trading
- Not a religious compliance certification
- Not a guarantee against token failure
