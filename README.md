# RetailOps Multi-Branch Platform (Flask + SQLite)

Production-style retail operations web app for multi-branch stores.

## Features
- Secure authentication with password hashing and RBAC (Admin/Manager/Staff)
- Branch-wise inventory, purchase, and sales workflows
- Customer and vendor management
- Invoice generation (HTML + PDF)
- Low-stock alerts + notification center
- KPI dashboard (daily sales, margin, stock turnover)
- Search/filter/pagination on key lists
- CSV exports (inventory and sales)
- Audit-log timeline
- Responsive HTML/CSS/JS UI
- Seed-data generator
- Automated tests (unit, integration, smoke)

## Tech Stack
- Flask 3
- SQLite 3
- ReportLab for PDF
- Pytest

## Project Structure
- `app.py` main Flask app and business logic
- `schema.sql` normalized DB schema
- `templates/` UI pages
- `static/` CSS and JS
- `scripts/setup.sh` create env + install + init + seed
- `scripts/run.sh` run web server
- `scripts/test.sh` run tests
- `tests/` test suite
- `docs/` architecture, API, schema, runbook, troubleshooting, deployment checklist

## Exact Run Commands
```bash
cd /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7cn5732b7261386fsawkwwyd82bet8-build-a-production-grade-multi-branch-retail-ope
bash scripts/setup.sh
bash scripts/run.sh
```
Open: `http://127.0.0.1:5000`

Demo users:
- admin / admin123
- manager1 / manager123
- staff1 / staff123

## Run Tests
```bash
cd /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7cn5732b7261386fsawkwwyd82bet8-build-a-production-grade-multi-branch-retail-ope
bash scripts/test.sh
```

## Notes
- SQLite DB file: `retail.db` in project root.
- Use `/seed` endpoint (or `python scripts/seed.py`) to populate seed data if needed.
