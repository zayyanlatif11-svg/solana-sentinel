# Experiments

Versioned strategy/risk/data-source configs. Replay uses **observed paper equity only**.

- If equity history has fewer than 10 points: `dataQuality = INSUFFICIENT_HISTORY`, metrics **hidden**, notes labeled DEMO DATA / INSUFFICIENT HISTORY
- SOL / BTC buy-and-hold only when a real price series is supplied — never a synthetic +1.5% path
- No sine-wave or invented trajectory that could be mistaken for verified performance

When a long enough paper equity series exists, cash / optional SOL / BTC / mechanical baselines are compared, with analytics sample-size warnings.
