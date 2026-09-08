# Risk engine

Portfolio/order checks (`risk-v1`): max position, exposure, simultaneous positions, min liquidity, max impact/slippage, max drawdown, turnover, cooldowns, min score, capital floor.

Outcomes: `APPROVE` | `REJECT` | `REDUCE_SIZE` with per-check audit trail.
