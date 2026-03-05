# Team Collaboration Web App (Flask + SQLite)

## Features delivered
- Email/password signup & login with persistent sessions (`remember=True`)
- Workspace creation and member invite flow
- RBAC-ish workspace admin controls (remove members, workload overview)
- Task CRUD-on-board creation with title/description/due date/priority/assignee
- Kanban board columns (`todo`, `in_progress`, `done`) with drag-enabled UI
- Task detail page with comments/notes and full history timeline
- Notifications for assignment and comments on assigned tasks
- Mobile-friendly responsive Bootstrap UI
- SQLite persistence

## Run
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed_data.py
python run.py
```

## Test
```bash
pytest -q
```
