# Architecture

## Stack
- Flask MVC app
- SQLite via Flask-SQLAlchemy
- Flask-Login for session auth
- Jinja templates + responsive CSS

## Layers
1. **Presentation**: HTML templates for dashboard and workflows.
2. **Application**: route handlers enforce RBAC and process workflows.
3. **Data**: SQLAlchemy models for users, branches, inventory, transactions, audit, notifications.

## Security
- Passwords hashed with Werkzeug.
- Role checks via decorator (`role_required`).
- Protected routes with `@login_required`.

## Operational Data Flow
- Purchase increases inventory.
- Sale decreases inventory and records margin components.
- Low stock triggers notification.
- All key actions append audit events.
