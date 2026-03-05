# Multi-Department Workforce Command Center

Flask + SQLite production-style implementation with RBAC (`admin/manager/reviewer`), employee CRUD, shift planning, attendance/leave workflows, payroll-ready exports, KPI dashboard, audit timeline, filtering/pagination, CSV/PDF exports, responsive UI, seed data, tests, and operations docs.

## Quick start
```bash
./scripts/setup.sh
./scripts/run.sh
```
Open: http://127.0.0.1:5060

## Test
```bash
./scripts/test.sh
```

## Seeded users
- admin/admin123
- manager1/manager123
- reviewer1/reviewer123

## Artifacts
- Architecture: `docs/ARCHITECTURE.md`
- Deployment: `docs/DEPLOYMENT.md`
- Health checks: `docs/HEALTHCHECKS.md`
- Rollback: `docs/ROLLBACK.md`
- QA report: `docs/QA_REPORT.md`
