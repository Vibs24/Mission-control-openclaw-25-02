from datetime import datetime

from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash


db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(120), nullable=False)
    avatar_color = db.Column(db.String(20), nullable=False, default="#3b82f6")
    password_hash = db.Column(db.String(255), nullable=False)
    last_active_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def initials(self) -> str:
        parts = [p for p in self.display_name.strip().split() if p]
        if not parts:
            return "?"
        if len(parts) == 1:
            return parts[0][0].upper()
        return f"{parts[0][0]}{parts[1][0]}".upper()


class SessionToken(db.Model):
    __tablename__ = "session_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    last_seen_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Workspace(db.Model):
    __tablename__ = "workspaces"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    invite_slug = db.Column(db.String(80), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class WorkspaceMember(db.Model):
    __tablename__ = "workspace_members"

    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False, default="member")
    joined_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
        db.CheckConstraint("role in ('admin', 'member')", name="ck_workspace_role"),
    )


class Invite(db.Model):
    __tablename__ = "invites"

    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    invited_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    accepted_at = db.Column(db.DateTime)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Task(db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(20), nullable=False, default="todo", index=True)
    priority = db.Column(db.String(20), nullable=False, default="medium")
    due_date = db.Column(db.Date)
    assignee_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.CheckConstraint("status in ('todo', 'in_progress', 'review', 'done')", name="ck_task_status"),
        db.CheckConstraint("priority in ('low', 'medium', 'high', 'urgent')", name="ck_task_priority"),
    )


class Comment(db.Model):
    __tablename__ = "comments"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="CASCADE"), index=True)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Activity(db.Model):
    __tablename__ = "activities"

    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    event_type = db.Column(db.String(40), nullable=False, index=True)
    field_name = db.Column(db.String(80), nullable=False, default="")
    old_value = db.Column(db.Text)
    new_value = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = db.Column(db.Integer, db.ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    body = db.Column(db.String(255), nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    read_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
