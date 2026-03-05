PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE session_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  invite_slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE workspace_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
  joined_at TEXT NOT NULL,
  UNIQUE(workspace_id, user_id),
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL,
  accepted_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('todo', 'in_progress', 'review', 'done')),
  priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TEXT,
  assignee_id INTEGER,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY(assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  actor_id INTEGER,
  event_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id INTEGER NOT NULL,
  actor_id INTEGER,
  workspace_id INTEGER NOT NULL,
  task_id INTEGER,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, created_at);
CREATE INDEX idx_session_tokens_expiry ON session_tokens(expires_at);
