#!/usr/bin/env bash
set -euo pipefail
echo "Basic secret scan (patterns)..."
# Scan likely secret material; ignore documentation mentions
matches=$(rg -n --hidden -g '!.git' -g '!pnpm-lock.yaml' -g '!node_modules' -g '!.env.example' -g '!*.md' -g '!scripts/secret-scan.sh' -g '!.gitleaks.toml' \
  -e 'BEGIN (RSA |OPENSSH )?PRIVATE KEY' \
  -e 'SUPABASE_SERVICE_ROLE_KEY=[A-Za-z0-9_-]{20,}' \
  -e 'OPENAI_API_KEY=sk-[A-Za-z0-9]{20,}' \
  -e 'HELIUS_API_KEY=[A-Za-z0-9_-]{20,}' \
  . || true)
if [[ -n "${matches}" ]]; then
  echo "$matches"
  echo "Potential secrets found"
  exit 1
fi
echo "No high-confidence secret patterns found"
