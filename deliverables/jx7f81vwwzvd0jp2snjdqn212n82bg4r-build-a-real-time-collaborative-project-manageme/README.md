# Real-time Collaborative Project Management Platform

Flask + SQLite dark-theme collaboration platform with Kanban board, task modal editing, comments, activity timeline, notifications, workspace management, invite link flow, member admin controls, and persistent sessions.

## Key features
- Email/password registration and login with persistent remember sessions
- Workspace creation + invite link join (`/join/<code>`) + direct email invite via members page
- Kanban board with 4 lanes: To Do, In Progress, Review, Done
- Lane task count badges + accent colors
- Cards show title, priority dot, due date (overdue red), assignee avatar, comment count
- Drag/drop card status updates instantly (AJAX)
- Full-screen modal: task edit form (left) + threaded comments and timeline (right)
- Slide-in drawer for new task creation
- Live search across title+description
- Notification bell panel for assignment/comment events
- Sidebar with board/members/activity/workspaces + online presence strip placeholder
- Members page admin controls: change role, remove, workload summary by status
- Relational schema with indexed status/assignee/workspace/notification recipient fields
- Cascading foreign keys enabled via SQLite pragma
- SessionToken table with expiry timestamps
- Responsive mobile layout (columns collapse to vertical stack)

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
python3 -m pytest -q
```
