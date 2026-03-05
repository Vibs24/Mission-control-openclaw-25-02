# Architecture Notes
- Flask monolith with role-gated route handlers.
- SQLAlchemy domain model: User, Employee, Shift, Attendance, LeaveRequest, AuditLog.
- Server-rendered Jinja templates for responsive UI.
- Export services for payroll CSV, attendance CSV, leave PDF.
- Audit events generated on auth + business actions.
