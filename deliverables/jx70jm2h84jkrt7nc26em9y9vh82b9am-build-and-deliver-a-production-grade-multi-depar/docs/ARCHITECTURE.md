# Architecture Notes

## Layers
1. Presentation: Jinja templates + responsive CSS
2. Service/Controller: Flask routes with RBAC guards and workflow logic
3. Data: SQLAlchemy models backed by SQLite

## Core Modules
- Auth + RBAC
- Department + Employee management
- Shift scheduling
- Attendance and leave management
- Payroll/reporting exports
- Audit logging

## Security
- Password hashing via Werkzeug
- Session auth via Flask-Login
- Role enforcement through decorator (`role_required`)
