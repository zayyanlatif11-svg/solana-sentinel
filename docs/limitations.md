# Limitations

- Default data path is DEMO unless API keys provided
- In-memory persistence resets with process restart
- Signal windows use snapshot features, not full historical bars
- Jupiter `/swap` build is intentionally not used for submission
- Helius adapter does not yet fully decode all Token-2022 extensions (permanent delegate / transfer hooks remain unknown)
- Helius `getAsset` failure on non-demo mints yields `INSUFFICIENT_DATA`-style null authorities rather than a fake clean profile
- `READ_ONLY` blocks paper fills; dashboard paper-trade is disabled in that mode
- Local `/api/state` is unauthenticated (demo bind `0.0.0.0:4317`)
- Package `lint` scripts outside `@sat/web` are stubs (`echo`); CI lints the web app and typechecks the workspace
- Experiment equity may include short demo replay series for UI — labeled as such
- No claim of profitable live performance
