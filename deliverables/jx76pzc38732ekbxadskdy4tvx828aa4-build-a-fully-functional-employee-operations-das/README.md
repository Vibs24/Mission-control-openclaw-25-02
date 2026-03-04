# Employee Operations Dashboard (Flask + SQLite)

Production-oriented internal dashboard for employee operations with:

- Secure login/logout (Flask-Login + password hashing)
- CRUD: Departments, Employees, Tasks
- Attendance and Leave tracking
- Search/filter + pagination on core list views
- KPI cards + status badges
- Audit-log timeline
- CSV export endpoints
- Responsive UI (Bootstrap)
- Seed data script
- Basic automated tests (pytest)

## 1) Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) Initialize sample data

```bash
python seed_data.py
```

Default credentials:
- `admin` / `admin123`

## 3) Run app

```bash
python run.py
```

Open: http://127.0.0.1:5000

## 4) Run tests

```bash
pytest -q
```

## 5) CSV exports

- `/export/employees`
- `/export/tasks`
- `/export/attendance`
- `/export/leaves`

## Structure

- `app/` Flask package (models/routes/templates/static)
- `run.py` app entrypoint
- `seed_data.py` database seed
- `tests/` test suite
