# Architecture Notes

- Flask monolith with blueprint routes.
- SQLite persistence through SQLAlchemy models.
- Session auth with Flask-Login + remember-me cookie for persistent sessions.
- Workspace scoped authorization via `WorkspaceMember` table.
- Task event model includes comments, notes, and immutable history entries.
- Notifications stored in DB and shown in in-app center.
