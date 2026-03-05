#!/usr/bin/env bash
set -euo pipefail
URL="${1:-http://127.0.0.1:5055/health}"
curl -fsS "$URL" | python3 -m json.tool
