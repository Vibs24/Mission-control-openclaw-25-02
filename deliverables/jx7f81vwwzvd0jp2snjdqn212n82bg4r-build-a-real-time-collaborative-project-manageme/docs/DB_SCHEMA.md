# Database Schema (SQLAlchemy Models)

Tables:
- users
- session_token
- workspace
- workspace_member (admin/member)
- invite
- task
- comment
- activity
- notification

Indexes:
- user.email
- task.workspace_id, task.status, task.assignee_id
- notification.recipient_id + created_at
- workspace.invite_slug
- session_token.token + expires_at

FKs use cascade/cleanup rules (`CASCADE` or `SET NULL`) via model definitions.
