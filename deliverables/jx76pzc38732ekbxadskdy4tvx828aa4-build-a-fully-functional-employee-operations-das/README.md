# Employee Operations Dashboard (Flask + SQLite)

Production-style Employee Operations dashboard with secure login/logout, CRUD modules, KPI cards, searchable/filterable tables, pagination, attendance + leave tracking, CSV export, audit timeline, responsive UI, seed data, and tests.

## Features

- Authentication: login/logout with password hashing (`Flask-Login`, `Werkzeug`)
- Dashboard KPIs: Employees, Departments, Open Tasks, Pending Leaves
- CRUD operations:
  - Departments: create/read/update/delete (with non-empty guard)
  - Employees: create/read/update/delete + search/filter + pagination
  - Tasks: create/read/update/delete + search/filter + pagination
  - Attendance: add/list + date filter + pagination
  - Leave tracking: add/list + status filter + pagination
- Status badges and responsive design
- CSV Export endpoints:
  - `/export/employees.csv`
  - `/export/tasks.csv`
- Audit log timeline for key actions
- Seed script with realistic sample data
- Automated tests with `pytest`

## Tech Stack

- Flask 3
- SQLite
- Flask-SQLAlchemy
- Flask-Login
- Vanilla HTML/CSS/JS

## Project Structure

```
.
├── app/
│   ├── __init__.py
│   ├── models.py
│   ├── routes.py
│   ├── static/style.css
│   └── templates/
├── tests/test_app.py
├── run.py
├── seed_data.py
├── requirements.txt
└── README.md
```

## Setup

```bash
python3 -m venv /tmp/empdash-venv
source /tmp/empdash-venv/bin/activate
pip install -r requirements.txt
export SECRET_KEY='replace-with-strong-secret'
python seed_data.py
python run.py
```

Open: `http://127.0.0.1:5000`

Default credentials (seeded):
- Username: `admin`
- Password: `admin123`

## Testing

```bash
source /tmp/empdash-venv/bin/activate
pytest -q
```

## Security Notes

- Passwords are hashed (Werkzeug)
- Auth-protected routes via `@login_required`
- Replace `SECRET_KEY` before production deploy
- Run behind WSGI server (e.g., gunicorn) for real production

## Quick Runbook

1. Seed DB with demo data (`python seed_data.py`)
2. Login as admin
3. Create/update records in each module
4. Export CSV from Employees/Tasks pages
5. Verify dashboard KPIs and audit timeline update
