# CollabFlow: Real-Time Collaborative Project Management

Production-ready Flask + SQLite collaborative project management platform with workspace scoping, role-based membership, kanban tasking, threaded comments, activity history diffs, notifications, and data exports.

## Features
- Email/password auth (`werkzeug` password hash) with persistent browser sessions via `session_tokens`
- Workspaces with switcher, email invite creation, and invite-token acceptance flow
- Member management (`admin` / `member`) with admin role change and removal controls
- Workload summary by status on the members page
- Kanban board with 4 status columns (`todo`, `in_progress`, `review`, `done`), badge counts, and unique accent colors
- Task cards with priority color dot, due date (overdue red), assignee avatar initials, comment count
- Drag-and-drop status update through fetch API without page reload
- Full-screen task detail modal with editable fields
- Threaded comments with timestamps and avatar initials
- Activity timeline with old/new value diff logging for edits, status, assignment, comments
- Slide-in drawer for task creation
- Top nav with live search, notification bell with unread/read controls, avatar dropdown menu
- Left sidebar with workspace switcher, board/members/activity links, simulated online presence
- CSV exports (`tasks`, `workload`) and PDF summary export
- Responsive dark charcoal UI with transitions/animations and mobile vertical column stacking

## Tech
- Python 3.11+
- Flask 3 + Flask-Login + Flask-SQLAlchemy
- SQLite
- Vanilla JS + CSS
- Pytest

## Quick Start
```bash
./scripts/setup.sh
./scripts/run.sh
```
Open `http://127.0.0.1:5000`.

## Seed Data
```bash
VENV=$(cat .venv_path)
SAFE=/tmp/collabflow_src_$(echo -n "$PWD" | shasum | awk '{print $1}')
ln -sfn "$PWD" "$SAFE"
PYTHONPATH="$SAFE" "$VENV/bin/python" "$SAFE/scripts/seed.py"
```
Seed login:
- `admin@example.com`
- `password123`

## Tests
```bash
./scripts/test.sh
```

## Docs
- `ARCHITECTURE.md`
- `API.md`
- `DB_SCHEMA.md`

## Scripts
- `scripts/setup.sh` create venv and install dependencies
- `scripts/run.sh` run the app in a path-safe execution context
- `scripts/test.sh` run pytest in a path-safe execution context
- `scripts/seed.py` populate sample data
