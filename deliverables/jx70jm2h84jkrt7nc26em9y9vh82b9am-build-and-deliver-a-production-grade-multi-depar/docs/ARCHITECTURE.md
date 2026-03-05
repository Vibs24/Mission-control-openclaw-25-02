# Architecture Notes
- UI: Server-rendered Jinja templates + responsive CSS.
- App: Flask route layer with RBAC decorator and audit logging.
- Data: SQLite normalized schema for departments, users, employees, shifts, attendance, leaves, and audit.
- Exports: CSV for operational datasets + payroll PDF for review sharing.
