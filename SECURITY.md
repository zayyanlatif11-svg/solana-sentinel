# Security Policy

## Product posture

This repository is a **research / paper-trading** platform. Live trade broadcast is disabled by multiple independent gates.

## Never commit

- Seed phrases, private keys, keypair JSON
- API keys, Supabase service role keys, wallet secrets
- `.env`, `.env.local`, or credential dumps

Use `.env.example` as the only committed env template. Secret scanning config: `.gitleaks.toml`.

## Trust boundaries

| Boundary | Rule |
|----------|------|
| Browser | No private keys; server actions only |
| LLM / research agent | No secrets in prompts; cannot execute or override engines |
| External metadata / social / web | UNTRUSTED; injection-sanitized |
| Execution provider | Quote + plan only; `canBroadcast` always `false` |
| Policy / risk / token-risk | Deterministic; LLM cannot bypass |
| Local HTTP API | Unauthenticated `GET`/`POST` `/api/state`. Demo default binds `0.0.0.0:4317`. Do not expose beyond a trusted network. |

## Reporting

If you find a credential leak or safety bypass, rotate keys immediately and open a private report to the maintainers.
