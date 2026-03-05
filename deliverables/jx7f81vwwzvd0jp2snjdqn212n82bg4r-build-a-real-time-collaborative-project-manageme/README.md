# Real-Time Collaborative Project Management Platform

Flask + SQLite collaboration app with workspaces, Kanban board, drag/drop status updates without page reload, task modal editing, threaded comments, activity timeline, notifications, member admin controls, and responsive dark UI.

## Setup
```bash
python3 -m venv /tmp/collabpm-venv
source /tmp/collabpm-venv/bin/activate
pip install -r requirements.txt
python seed_data.py
python run.py
```

## Features delivered
- Email/password registration + persistent remember sessions.
- Workspace creation, invite token flow, direct email invite records.
- 4-lane Kanban: To Do, In Progress, Review, Done.
- Count badges, priority dots, overdue red highlights, assignee avatars, comment counts.
- Drag/drop cards with instant fetch update (no reload required for state sync).
- Full-screen split task modal: metadata editor + comments + timeline.
- Slide-in drawer for new task creation.
- Live search across task title+description.
- Notification panel and profile area in top nav.
- Sidebar: workspace switcher, nav links, online presence strip.
- Admin member controls: role change/remove + workload summary per status.
- Relational DB tables + indexes + FK cascades for cleanup.

## Test
```bash
source /tmp/collabpm-venv/bin/activate
pytest -q
```
