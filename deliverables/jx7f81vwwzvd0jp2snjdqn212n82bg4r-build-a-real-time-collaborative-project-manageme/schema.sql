PRAGMA foreign_keys = ON;

CREATE TABLE user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE session_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE workspace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  invite_slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE workspace_member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  UNIQUE(workspace_id, user_id),
  FOREIGN KEY(workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE invite (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL,
  accepted_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_by) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  due_date TEXT,
  assignee_id INTEGER,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY(assignee_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE comment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES task(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id) REFERENCES comment(id) ON DELETE CASCADE
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  actor_id INTEGER,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES task(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_id) REFERENCES user(id) ON DELETE SET NULL
);

CREATE TABLE notification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id INTEGER NOT NULL,
  actor_id INTEGER,
  workspace_id INTEGER NOT NULL,
  task_id INTEGER,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(recipient_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES task(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_workspace ON task(workspace_id);
CREATE INDEX idx_task_status ON task(status);
CREATE INDEX idx_task_assignee ON task(assignee_id);
CREATE INDEX idx_notification_recipient ON notification(recipient_id, created_at);
