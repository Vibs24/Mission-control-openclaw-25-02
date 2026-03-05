# ARCHITECTURE

## Overview
CollabFlow is a server-rendered Flask app augmented with lightweight fetch-based APIs for real-time-ish interactions. The server remains the source of truth while the UI polls for board and notification updates.

## Layers
- `app/models.py`: SQLAlchemy entities and constraints
- `app/routes.py`: page routes + JSON APIs + export endpoints
- `app/templates/*`: server-rendered views (auth, workspace, board, members, activity)
- `app/static/app.js`: dynamic UI behavior (kanban rendering, drag/drop, modal, notifications)
- `app/static/style.css`: dark responsive theme and transition system

## Session/Auth Model
- Passwords are stored as salted hashes using Werkzeug.
- Flask-Login handles authenticated session state.
- `session_tokens` table stores persistent tokens (`expires_at`, `last_seen_at`), enabling re-authentication across browser closes.
- `before_request` middleware restores login when a valid token cookie exists.

## Workspace Isolation
Every collaborative object is scoped to `workspace_id`. Membership checks guard all board/member/activity/API/export actions.

## Activity Logging
Task mutating operations call `_log_activity(...)` with:
- `event_type`
- `field_name`
- `old_value`
- `new_value`
This enables auditability and timeline reconstruction.

## Real-Time Behavior
- Board polling: 7 seconds
- Notifications polling: 12 seconds
- Drag-and-drop status updates are immediate via `/api/task/<id>/move`

## Presence Simulation
Online presence is derived from `session_tokens.last_seen_at` within a rolling 10-minute window for members of the selected workspace.

## Exports
- CSV: tasks and workload summaries
- PDF: lightweight generated summary report (no external PDF library)
