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
- Backup `retail_ops.db`
- Recreate schema: `flask --app app:create_app init-db`
- Re-seed: `python3 seed.py`
