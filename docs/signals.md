# Historical signals (v1.5)

Signals prefer Zod-validated OHLCV bars (`timestamp`, `open`, `high`, `low`, `close`, `volume`). Missing history is **INSUFFICIENT_DATA** / reduced confidence. Bars are never invented or interpolated.

Relative strength uses **SOL** (optional BTC) returns from aligned bars. There is **no hardcoded +2% benchmark**.

## Minimum history

| Feature | Interval | Min bars | Notes |
|---------|----------|----------|--------|
| Momentum 5m return | 5m | 2 | Simple return between last two closes |
| Momentum 15m return | 15m | 2 | Falls back to coarser interval if 15m missing |
| Momentum 1h return | 1h | 2 | |
| Momentum acceleration | 5m | 3 | `r_t - r_{t-1}` |
| Volume baseline | 5m | 20 | Mean of prior 20 bars (excludes current) |
| Relative volume | 5m | 21 | Current / baseline |
| Volume acceleration | 5m | 3 | |
| Realized volatility | 5m | 12 | Stdev of log-returns |
| Vol expansion | 5m | 24 | Short vs longer window |
| RS vs SOL | 5m | 2 + SOL 2 | Optional BTC; omitted when unavailable |
| Trend / breakout | 1h | 20 | 5m used only as coarser fallback, not interpolated 1h |

Provider: Birdeye `GET /defi/v3/ohlcv` (`mode=count`, `padding=false`) then legacy `/defi/ohlcv`. DEMO provider emits labeled deterministic bars.

Lookahead: bars with `timestamp > asOf` are dropped.
