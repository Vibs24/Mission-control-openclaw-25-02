# TeamFlow Collaboration App (Flask + SQLite)

A team collaboration platform with workspace-based task boards, assignment notifications, task detail discussions, history tracking, and admin member controls.

## Features
- Email/password signup + login with persistent remembered sessions
- Workspace creation and teammate invites (token-based acceptance)
- RBAC inside workspace (Admin / Member)
- Task board with drag-and-drop status updates (Todo / In Progress / Done)
- Task details: comments, notes, assignment controls, full change history
- Notification center (task assigned, comment on assigned task)
- Admin member management (invite/remove + in-progress overview)
- SQLite persistence (all data survives refresh)
- Responsive UI (desktop + mobile)

## Setup
```bash
python3 -m venv /tmp/teamflow-venv
source /tmp/teamflow-venv/bin/activate
pip install -r requirements.txt
python seed_data.py
python run.py
```

## Tests
```bash
source /tmp/teamflow-venv/bin/activate
pytest -q
```

## Seed Accounts
- owner@example.com / owner123
- member@example.com / member123
