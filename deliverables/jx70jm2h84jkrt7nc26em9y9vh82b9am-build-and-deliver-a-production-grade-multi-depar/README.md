# Flask + SQLite Multi-Department Workforce Command Center

Production-oriented workforce operations dashboard built with Flask and SQLite.

## Features

- RBAC with `Admin`, `Manager`, `Reviewer`
- Secure login/logout with hashed passwords
- Employee CRUD
- Shift planning module
- Attendance workflow and review
- Leave request + approve/reject workflow
- Payroll-ready export
- KPI dashboard + audit timeline
- Advanced filters/search/pagination
- CSV + PDF exports (`employees`, `shifts`, `attendance`, `leaves`, `payroll`)
- Notification center
- Responsive HTML/CSS/JS UI
- Seed script with realistic demo data
- Unit + integration + smoke tests
- Deployment, health check, and rollback scripts

## Project Structure

- `app.py`
- `schema.sql`
- `templates/`
- `static/`
- `scripts/`
- `tests/`
- `docs/`

## Quick Start

```bash
./scripts/setup.sh
./scripts/run.sh
```

App URL: `http://127.0.0.1:5000`

## Default Seeded Accounts

- `admin / admin123` (Admin)
- `manager / manager123` (Manager)
- `reviewer / reviewer123` (Reviewer)

Change credentials immediately in production.

## Dependency Fallback (Offline-friendly)

If normal pip install is unavailable, scripts support `PYTHONPATH=.pydeps` fallback.

- Install target fallback: `.pydeps/`
- Runtime fallback: exported by `scripts/run.sh` and `scripts/test.sh`

## Test

```bash
./scripts/test.sh
```

## Seed Data

```bash
python3 scripts/seed.py
python3 scripts/seed.py --reset
```

## Exports

Authenticated routes:

- `/exports/employees.csv`, `/exports/employees.pdf`
- `/exports/shifts.csv`, `/exports/shifts.pdf`
- `/exports/attendance.csv`, `/exports/attendance.pdf`
- `/exports/leaves.csv`, `/exports/leaves.pdf`
- `/exports/payroll.csv`, `/exports/payroll.pdf?month=YYYY-MM`

## Operational Scripts

- `scripts/setup.sh` - setup env, install deps, seed DB
- `scripts/run.sh` - run application
- `scripts/test.sh` - execute automated tests
- `scripts/deploy.sh` - create release and update `deployments/current`
- `scripts/healthcheck.sh` - hit `/health` and verify JSON status (`--internal` mode for sandbox/offline validation)
- `scripts/rollback.sh` - rollback `deployments/current` to previous release

## Health Endpoint

- `GET /health` -> `200` and JSON status when app + DB are healthy

## Docs

- Architecture: `docs/ARCHITECTURE.md`
- Rollback: `docs/ROLLBACK_GUIDE.md`
- Test results: `TEST_RESULTS.md`
- QA report: `QA_REPORT.md`
