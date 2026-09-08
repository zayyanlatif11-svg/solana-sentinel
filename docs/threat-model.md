# Threat model

## Assets

- API credentials, future wallet keys, user strategy IP, integrity of research decisions

## Threats & mitigations

| Threat | Mitigation |
|--------|------------|
| Accidental live broadcast | Hard `canBroadcast=false`; LIVE remapped; multi-env unlock unused |
| Key exfiltration via LLM | Secrets never passed to research prompts; mock mode default |
| Prompt injection via token metadata | Pattern sanitize; treat text UNTRUSTED; Zod-bound output |
| Malformed market payloads | Zod validation; reject events |
| Policy bypass via agent | Policy/risk/token-risk deterministic and authoritative |
| Dependency / supply chain | Lockfile; CI install; minimal deps |
| Secret commit | `.gitignore`, `.env.example` only, gitleaks config |
| Spoofed “safe” labeling | Risk tiers exclude SAFE |
| Demo mistaken for live edge | UI DEMO banners; `isDemo` fields; HANDOFF honesty |

## Out of scope tonight

Authorized LIVE trading, custody, and on-chain settlement.
