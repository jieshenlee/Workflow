#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Project Digital — API connectivity test (Linux/macOS/WSL)
# Phase 1 checklist item: "APIs tested (Claude, OpenAI, Bitly)".
#
# Reads keys from .env in the project root and makes one cheap,
# real call per configured API. Requires: bash, curl, jq.
#
# Usage (from project root):
#   ./scripts/test-apis.sh
# ─────────────────────────────────────────────────────────
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env found at $ENV_FILE — copy .env.example to .env first." >&2
  exit 1
fi

# Load .env (export each KEY=VALUE, ignore comments/blanks)
set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep '=')
set +a

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
fail_count=0

report() { # name status detail
  case "$2" in
    OK)      printf "  [${GREEN}%-7s${NC}] %-12s %s\n" "$2" "$1" "$3" ;;
    FAIL)    printf "  [${RED}%-7s${NC}] %-12s %s\n" "$2" "$1" "$3"; fail_count=$((fail_count+1)) ;;
    *)       printf "  [${YELLOW}%-7s${NC}] %-12s %s\n" "$2" "$1" "$3" ;;
  esac
}

echo -e "\n${CYAN}Testing Project Digital APIs...${NC}\n"

# ── Claude ──
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  report "Claude" "SKIPPED" "ANTHROPIC_API_KEY not set"
else
  code=$(curl -s -o /tmp/pd_claude.json -w "%{http_code}" https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
    -d '{"model":"claude-haiku-4-5-20251001","max_tokens":8,"messages":[{"role":"user","content":"ping"}]}')
  [[ "$code" == "200" ]] && report "Claude" "OK" "model $(jq -r .model /tmp/pd_claude.json)" \
    || report "Claude" "FAIL" "HTTP $code: $(jq -r '.error.message // empty' /tmp/pd_claude.json)"
fi

# ── OpenAI ──
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  report "OpenAI" "SKIPPED" "OPENAI_API_KEY not set"
else
  code=$(curl -s -o /tmp/pd_openai.json -w "%{http_code}" https://api.openai.com/v1/models \
    -H "Authorization: Bearer $OPENAI_API_KEY")
  [[ "$code" == "200" ]] && report "OpenAI" "OK" "$(jq '.data | length' /tmp/pd_openai.json) models available" \
    || report "OpenAI" "FAIL" "HTTP $code"
fi

# ── Bitly ──
if [[ -z "${BITLY_ACCESS_TOKEN:-}" ]]; then
  report "Bitly" "SKIPPED" "BITLY_ACCESS_TOKEN not set"
else
  code=$(curl -s -o /tmp/pd_bitly.json -w "%{http_code}" https://api-ssl.bitly.com/v4/user \
    -H "Authorization: Bearer $BITLY_ACCESS_TOKEN")
  [[ "$code" == "200" ]] && report "Bitly" "OK" "user $(jq -r .login /tmp/pd_bitly.json)" \
    || report "Bitly" "FAIL" "HTTP $code"
fi

# ── Buffer (Phase 3) ──
if [[ -z "${BUFFER_ACCESS_TOKEN:-}" ]]; then
  report "Buffer" "SKIPPED" "BUFFER_ACCESS_TOKEN not set (Phase 3)"
else
  code=$(curl -s -o /tmp/pd_buffer.json -w "%{http_code}" \
    "https://api.bufferapp.com/1/user.json?access_token=$BUFFER_ACCESS_TOKEN")
  [[ "$code" == "200" ]] && report "Buffer" "OK" "user $(jq -r .id /tmp/pd_buffer.json)" \
    || report "Buffer" "FAIL" "HTTP $code"
fi

echo ""
if [[ "$fail_count" -gt 0 ]]; then echo -e "${RED}$fail_count API(s) failed.${NC}\n"; exit 1; fi
echo -e "${GREEN}Done. No failures.${NC}\n"
