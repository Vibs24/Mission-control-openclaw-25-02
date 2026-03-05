# Architecture Notes
- Backend: Flask + Flask-Login + Flask-SQLAlchemy.
- DB: Relational tables for users, workspaces, members, invites, tasks, comments, activity, notifications, session tokens.
- Frontend: server-rendered templates + AJAX drag/drop updates + responsive dark editorial UI.
- Performance: indexes on key lookup fields (status, assignee, workspace, recipients, token).
