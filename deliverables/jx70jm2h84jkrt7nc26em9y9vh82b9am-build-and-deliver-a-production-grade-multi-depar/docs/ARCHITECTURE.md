# Architecture Notes

## Stack

- Backend: Flask (monolithic app in `app.py`)
- DB: SQLite (`schema.sql`)
- Frontend: Jinja templates + vanilla CSS/JS
- Tests: Pytest

## Key Layers

1. Request / Route Layer
- Authenticated and role-guarded endpoints with decorators:
  - `login_required`
  - `roles_required`

2. Domain Workflows
- Employees: create/update/delete/list
- Shifts: plan/delete/list
- Attendance: upsert/review/list
- Leave: request/review/list
- Notifications: list/read/read-all
- Audit: append-only timeline

3. Data Layer
- `get_db()` and `sqlite3.Row` access
- Explicit SQL queries with dynamic filters
- Indexed fields for common search patterns

4. Reporting / Exports
- CSV generation via `csv.writer`
- PDF generation via internal minimal PDF builder (`build_basic_pdf`)
- Payroll calculations from attendance + hourly rates

## Security Design

- Passwords stored as hash (`werkzeug.security.generate_password_hash`)
- Session-based auth
- RBAC checks on privileged actions
- No plaintext credential storage in DB

## Reliability

- `/health` checks API + DB connectivity
- Deployment script snapshots releases and keeps previous target
- Rollback script switches symlink to prior release

## Operational Assumptions

- SQLite is acceptable for single-node or light workloads
- For scale, migrate DB access layer to PostgreSQL and introduce connection pooling
- For production hardening, place behind reverse proxy and set secure secret/session settings

