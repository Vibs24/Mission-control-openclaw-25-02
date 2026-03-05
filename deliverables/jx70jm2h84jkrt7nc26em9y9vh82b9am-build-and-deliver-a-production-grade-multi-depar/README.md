# Multi-Department Workforce Command Center

Production-grade workforce platform built using Flask + SQLite + HTML/CSS/JS.

## Scope Delivered
- Secure RBAC login (`Admin`, `Manager`, `Reviewer`)
- Employee CRUD
- Shift planning
- Attendance + leave workflows
- Payroll-ready CSV export
- KPI dashboard
- Audit timeline
- Advanced filter/search/pagination on major modules
- CSV + PDF exports
- Responsive UI (Bootstrap)
- Seed data
- Automated tests (unit + integration + smoke)
- Architecture notes + deployment script + health checks + rollback guide + QA report

## Setup / Run
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed_data.py
python run.py
```

## Alternate Deploy Shortcut
```bash
./deploy.sh
```

## Health Check
```bash
./healthcheck.sh
```

## Test
```bash
pytest -q
```
