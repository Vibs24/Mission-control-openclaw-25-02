#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "--internal" ]; then
  python3 <<'PY'
from app import create_app

app = create_app({"TESTING": True})
with app.test_client() as client:
    response = client.get("/health")
    payload = response.get_json()

if response.status_code == 200 and payload.get("status") == "ok" and payload.get("database") == "ok":
    print(f"HEALTHCHECK_PASS internal status={payload['status']} database={payload['database']} timestamp={payload.get('timestamp')}")
    raise SystemExit(0)

print(f"HEALTHCHECK_FAIL internal status_code={response.status_code} payload={payload}")
raise SystemExit(1)
PY
  exit 0
fi

URL="${1:-http://127.0.0.1:5000/health}"

python3 - "$URL" <<'PY'
import json
import sys
import urllib.request

url = sys.argv[1]
try:
    with urllib.request.urlopen(url, timeout=5) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
except Exception as exc:
    print(f"HEALTHCHECK_FAIL url={url} error={exc}")
    raise SystemExit(1)

if payload.get("status") == "ok" and payload.get("database") == "ok":
    print(f"HEALTHCHECK_PASS status={payload['status']} database={payload['database']} timestamp={payload.get('timestamp')}")
    raise SystemExit(0)

print(f"HEALTHCHECK_FAIL payload={payload}")
raise SystemExit(1)
PY
