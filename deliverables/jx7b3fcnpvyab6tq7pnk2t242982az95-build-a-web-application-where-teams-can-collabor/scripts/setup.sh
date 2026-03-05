#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv /tmp/teamflow-venv
source /tmp/teamflow-venv/bin/activate
pip install -r requirements.txt
python3 - <<'PY'
from run import create_app
app=create_app({'DATABASE':'collab.db'})
with app.app_context(): app.init_db()
print('db initialized')
PY
