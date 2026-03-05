# DB_SCHEMA

## Relational Tables

### `users`
- `id` PK
- `email` unique
- `display_name`
- `avatar_color`
- `password_hash`
- `last_active_at`
- `created_at`

### `session_tokens`
- `id` PK
- `user_id` FK -> `users.id` ON DELETE CASCADE
- `token` unique
- `expires_at`
- `last_seen_at`
- `created_at`

### `workspaces`
- `id` PK
- `name`
- `owner_id` FK -> `users.id` ON DELETE CASCADE
- `invite_slug` unique
- `created_at`

### `workspace_members`
- `id` PK
- `workspace_id` FK -> `workspaces.id` ON DELETE CASCADE
- `user_id` FK -> `users.id` ON DELETE CASCADE
- `role` (`admin` | `member`)
- `joined_at`
- unique `(workspace_id, user_id)`

### `invites`
- `id` PK
- `workspace_id` FK -> `workspaces.id` ON DELETE CASCADE
- `email`
- `token` unique
- `invited_by` FK -> `users.id` ON DELETE CASCADE
- `accepted_at`
- `expires_at`
- `created_at`

### `tasks`
- `id` PK
- `workspace_id` FK -> `workspaces.id` ON DELETE CASCADE
- `title`
- `description`
- `status` (`todo` | `in_progress` | `review` | `done`)
- `priority` (`low` | `medium` | `high` | `urgent`)
- `due_date`
- `assignee_id` FK -> `users.id` ON DELETE SET NULL
- `created_by` FK -> `users.id` ON DELETE CASCADE
- `created_at`
- `updated_at`

### `comments`
- `id` PK
- `task_id` FK -> `tasks.id` ON DELETE CASCADE
- `user_id` FK -> `users.id` ON DELETE CASCADE
- `parent_id` FK -> `comments.id` ON DELETE CASCADE
- `body`
- `created_at`

### `activities`
- `id` PK
- `workspace_id` FK -> `workspaces.id` ON DELETE CASCADE
- `task_id` FK -> `tasks.id` ON DELETE CASCADE
- `actor_id` FK -> `users.id` ON DELETE SET NULL
- `event_type`
- `field_name`
- `old_value`
- `new_value`
- `created_at`

### `notifications`
- `id` PK
- `recipient_id` FK -> `users.id` ON DELETE CASCADE
- `actor_id` FK -> `users.id` ON DELETE SET NULL
- `workspace_id` FK -> `workspaces.id` ON DELETE CASCADE
- `task_id` FK -> `tasks.id` ON DELETE CASCADE
- `body`
- `is_read`
- `read_at`
- `created_at`

## Required Indexes
- `tasks(status)`
- `tasks(assignee_id)`
- `tasks(workspace_id)`
- `notifications(recipient_id, created_at)`

## Foreign Keys
All relationships are explicit and cascading behavior is configured for cleanup consistency.
