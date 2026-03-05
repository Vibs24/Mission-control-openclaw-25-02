# Editorial PM — Real-Time Collaborative Project Management

Flask + SQLAlchemy platform with:
- Email/password registration and persistent sessions
- Workspace creation, switcher, invite link + direct email invite records
- Kanban board with 4 columns (To Do, In Progress, Review, Done), badges, priority dots, overdue highlight, assignee and comment count
- Drag and drop card moves via AJAX (no full page reload)
- Task detail "modal-style" split panel for editing + threaded comments + full activity timeline
- Right drawer for new task creation
- Global search in top nav, notifications panel, members/admin management, workload summaries
- Cascading FK cleanup via SQLAlchemy FK `ondelete` usage and indexed critical fields

## Run
```bash
./scripts/setup.sh
./scripts/run.sh
```
Open: http://127.0.0.1:5080

## Test
```bash
./scripts/test.sh
```
