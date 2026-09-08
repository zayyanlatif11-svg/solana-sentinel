#!/usr/bin/env bash
set -euo pipefail
echo "Basic secret scan (patterns)..."
if rg -n --hidden -g '!.git' -g '!pnpm-lock.yaml' -g '!node_modules' -g '!.env.example' \
  -e 'BEGIN (RSA |OPENSSH )?PRIVATE KEY' \
  -e 'seed phrase' \
  -e 'SUPABASE_SERVICE_ROLE_KEY=\w{20,}' \
  -e 'OPENAI_API_KEY=sk-[A-Za-z0-9]{20,}' \
  . ; then
  echo "Potential secrets found"
  exit 1
fi
echo "No high-confidence secret patterns found"
