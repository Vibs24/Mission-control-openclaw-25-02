# Multi-Branch Retail Operations Platform (Flask + SQLite)

Production-grade retail operations app with RBAC, branch inventory, purchase/sales flows, invoice generation, alerts, exports, and auditability.

## Features
- RBAC auth: **Admin / Manager / Staff**
- Branch management
- Product/Customer/Vendor master management
- Branch-wise inventory with reorder levels + low-stock alerts
- Purchase workflows (stock in)
- Sales workflows (stock out) + invoice page
- KPI dashboard: daily sales, margins, stock turnover
- Advanced list capabilities: filters/search/pagination (inventory + paged lists)
- Exports: CSV (sales/inventory), PDF (invoice)
- Notification center
- Audit-log timeline
- Responsive Bootstrap UI

## Quick Start
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed_data.py
python run.py
```
Open `http://127.0.0.1:5000`

## Seed Users
- `admin / admin123`
- `manager / manager123`
- `staff / staff123`

## Tests
```bash
pytest -q
```
Includes unit, integration, and smoke coverage.

## Scripts
- `setup.sh` setup + seed
- `test.sh` run tests

## Documentation
See `/app/docs`:
- `ARCHITECTURE.md`
- `API_SPEC.md`
- `DB_SCHEMA.md`
- `RUNBOOK.md`
- `TROUBLESHOOTING.md`
- `DEPLOYMENT_CHECKLIST.md`
