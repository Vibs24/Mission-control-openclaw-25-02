# Architecture
- Flask app with server-rendered pages + lightweight JS for DnD updates.
- SQLite schema stores users/workspaces/members/tasks/comments/history/notifications.
- Session auth with `session.permanent=True` keeps users logged in.
