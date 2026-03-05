# Multi-Department Workforce Command Center

## Features
RBAC (Admin/Manager/Reviewer), employee CRUD, shift planning, attendance/leave workflows, payroll-ready CSV, KPI dashboard, audit timeline, filters/search/pagination, CSV/PDF exports, responsive UI.

## Reproducible Setup
```bash
./scripts/setup.sh
./scripts/run.sh
```
Open: http://127.0.0.1:5000

Seeded users:
- admin / admin123
- manager / manager123
- reviewer / review123

## Tests
```bash
./scripts/test.sh
```

## Deployment + Ops
- Deployment script: `docs/DEPLOY.sh`
- Health checks: `docs/HEALTH_CHECKS.md`
- Rollback: `docs/ROLLBACK_GUIDE.md`
- QA report: `docs/QA_REPORT.md`
