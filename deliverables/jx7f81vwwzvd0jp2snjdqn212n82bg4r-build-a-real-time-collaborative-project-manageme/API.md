# API

All API endpoints require authentication unless otherwise noted.

## Auth + Workspace
- `POST /signup` form: `display_name`, `email`, `password`
- `POST /login` form: `email`, `password`
- `GET /logout`
- `GET /workspaces`
- `POST /workspaces` form: `name`
- `GET /workspace/<ws_id>/select`
- `POST /workspace/<ws_id>/invite` form: `email` (admin only)
- `GET|POST /invites/<token>/accept` (public)
- `GET|POST /invite/<token>` (compat route)

## Board + Tasks
- `GET /api/board?q=<query>`
  - returns board columns keyed by status
- `POST /api/task`
  - json: `title`, `description`, `priority`, `status`, `due_date`, `assignee_id`
- `GET /api/task/<task_id>`
  - returns task detail, workspace members, threaded comments, activity timeline
- `POST /api/task/<task_id>/move`
  - json: `status`
- `POST /api/task/<task_id>/update`
  - json: `title`, `description`, `priority`, `due_date`, `assignee_id`
- `POST /api/task/<task_id>/comment`
  - json: `body`, optional `parent_id`

## Members + Activity Pages
- `GET /members`
- `POST /members` form: `target_user_id`, `role` (admin only)
- `POST /members/remove/<user_id>` (admin only)
- `GET /activity`

## Notifications
- `GET /api/notifications`
- `POST /api/notifications/<notif_id>/read`
- `POST /api/notifications/read-all`

## Exports
- `GET /export/tasks.csv`
- `GET /export/workload.csv`
- `GET /export/summary.pdf`

## Response Conventions
- Success JSON includes `ok: true` where relevant
- Validation failures return `400` with error payload where relevant
- Unauthorized or out-of-workspace access returns `403`
