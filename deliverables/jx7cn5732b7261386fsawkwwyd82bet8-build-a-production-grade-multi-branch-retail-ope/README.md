# Multi-Branch Retail Operations Platform (Flask + SQLite)

Production-oriented reference implementation covering RBAC auth, branch-wise inventory/purchase/sales workflows, customer/vendor management, invoice generation, exports, audit logs, notifications, and KPI dashboard.

## Features
- RBAC: `admin`, `manager`, `staff`
- Branch-aware data model (products/customers/vendors/sales/purchases)
- KPI dashboard: daily sales, daily margins, stock turnover
- Low-stock alerts + notification center
- Search/filter/pagination for inventory
- CSV exports for inventory/sales/purchases/customers/vendors/audit
- PDF invoice download
- Audit log timeline
- Seed generator and automated tests (unit/integration/smoke)

## Quick Start
```bash
cd deliverables/jx7cn5732b7261386fsawkwwyd82bet8-build-a-production-grade-multi-branch-retail-ope
./scripts/setup.sh
./scripts/run.sh
```
Open: http://127.0.0.1:5050

## Test
```bash
./scripts/test.sh
```

## Seeded Users
- admin / admin123
- manager1 / manager123
- staff1 / staff123

## Documentation
- Architecture: `docs/ARCHITECTURE.md`
- API Spec: `docs/API_SPEC.md`
- DB Schema: `docs/DB_SCHEMA.md`
- Runbook: `docs/RUNBOOK.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- Deployment Readiness: `docs/DEPLOYMENT_CHECKLIST.md`
