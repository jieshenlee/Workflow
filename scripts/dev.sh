#!/usr/bin/env bash
# Starts the Project Digital API and dashboard together; Ctrl+C stops both.
# First-time setup is in README.md (Getting started).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$ROOT/backend" && source .venv/bin/activate && exec uvicorn app.main:app --reload --port 8000) &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT
cd "$ROOT/dashboard" && npm run dev
