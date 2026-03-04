# Employee Operations Dashboard (Flask + SQLite)

Production-ready starter dashboard for employee operations with authentication, CRUD, KPI insights, attendance/leave tracking, audit timeline, CSV exports, and tests.

## Features
- Secure login/logout (`Flask-Login`, hashed passwords)
- CRUD modules: Employees, Departments, Tasks
- Attendance tracking and Leave management
- Search, filters, and pagination
- KPI cards + status badges
- CSV export endpoints
- Audit-log timeline for key operations
- Responsive HTML/CSS UI
- Seed script with realistic starter data
- Basic automated tests (pytest)

## Quickstart
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed_data.py
python app.py
```
Open: http://127.0.0.1:5000

Default login after seed:
- Username: `admin`
- Password: `admin123`

## Run tests
```bash
pytest -q
```

## Project structure
- `app.py` – Flask app + models + routes
- `templates/` – HTML templates
- `static/style.css` – responsive styling
- `seed_data.py` – database seeding
- `tests/test_app.py` – smoke/functional tests

## Notes
- For production, set `SECRET_KEY` via environment and run behind gunicorn/nginx.
- SQLite is used for portability. Swap URI for Postgres in `SQLALCHEMY_DATABASE_URI` when scaling.
