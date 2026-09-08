# Resume / project notes (honest)

## Claims you can make

- Built a monorepo Solana **research** platform with discovery → historical/snapshot signals → token-risk → policy → portfolio risk → Jupiter quote planning → paper execution → experiments
- Emphasized safety gates, provenance, and explainability
- Implemented provider pattern with DEMO fallbacks
- Added Postgres persistence when `DATABASE_URL` is set, with labeled in-memory fallback
- Added Vitest + Playwright coverage for rejection and safety paths (live off, canBroadcast false, SCAMX reject, paper fill, duplicate block)

## Claims you must not make

- Live profitable trading results or verified strategy alpha
- Audited smart-contract security or complete rug/honeypot detection
- Shariah certification / fatwa / complete compliance
- Production custody or mainnet settlement
- That Token-2022 / holder risk is complete when DAS fields are null
- That workspace lint was always real before V1.5 (it was stub `echo` except `@sat/web`)

## Demo evidence

Run the dashboard and paper-execute an APPROVED proposal; show `canBroadcast=false` in the UI and execution plan, DEMO / PAPER banners, and `health.liveTradingAllowed: false`.
