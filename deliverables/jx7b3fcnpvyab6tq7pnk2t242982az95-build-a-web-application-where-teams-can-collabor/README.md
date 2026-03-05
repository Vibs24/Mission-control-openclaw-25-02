# TeamFlow Collaboration App

Flask + SQLite team collaboration app with signup/login, workspaces, invites, task board with drag-and-drop status columns, task detail (comments/notes/history), notifications, admin member management, and workload overview.

## Features
- Email/password signup + persistent sessions
- Create workspace + invite teammates
- Tasks: title/description/due date/priority/assignee
- Kanban board: todo/doing/done (drag-and-drop)
- Task detail: comments, notes, change history timeline
- Notifications on assignment/comment
- Admin controls: view/remove members, workload overview
- CSV/PDF export endpoints
- Mobile + desktop responsive layout

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/seed.py
python app.py
```
Open http://127.0.0.1:5000

Seed user: `admin@team.com / admin123`

## Tests
```bash
pytest -q
```
