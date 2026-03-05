# Multi-Department Workforce Command Center

Flask + SQLite production-grade workforce operations app.

## Included Scope
- Secure RBAC login: Admin / Manager / Reviewer
- Employee CRUD
- Shift planning
- Attendance and leave workflows
- Payroll-ready exports (CSV + PDF)
- KPI dashboard
- Audit timeline
- Advanced filters/search/pagination
- Responsive UI
- Seed data + reproducible scripts
- Automated tests (unit + integration + smoke)

## Setup / Run / Test
```bash
./scripts/deploy.sh
./scripts/run.sh
./scripts/test.sh
```

Seeded users:
- admin/admin123
- manager/manager123
- reviewer/reviewer123

## Documentation
See `docs/` for architecture notes, deployment readiness, and QA artifacts.
