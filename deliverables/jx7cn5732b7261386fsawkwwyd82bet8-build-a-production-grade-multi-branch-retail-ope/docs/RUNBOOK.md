# Runbook

## Start
1. `./scripts/setup.sh`
2. `./scripts/run.sh`
3. Validate login and dashboard load.

## Daily Ops Checks
- Dashboard KPI render
- Low-stock alerts present when thresholds crossed
- Exports downloadable
- Audit timeline receives new entries after transactions

## Recovery
- Backup `retail.db`
- Recreate schema: `python3 - <<'PY'
from app import create_app
app = create_app()
with app.app_context():
    app.init_db()
PY`
- Re-seed: `python3 scripts/seed.py --reset`
