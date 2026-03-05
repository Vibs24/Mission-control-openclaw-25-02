# Multi-Branch Retail Operations Platform (Flask + SQLite)

Production-grade reference implementation for retail branch operations with RBAC auth, inventory/purchase/sales workflows, customer/vendor management, invoice generation, low-stock alerts, KPI dashboard, exports, audit logging, and notification center.

## Quick Start

```bash
./scripts/setup.sh
./scripts/run.sh
```

Open: `http://127.0.0.1:5000`

Seed users:
- Admin: `admin / admin123`
- Manager: `manager / manager123`
- Staff: `staff / staff123`

## Testing

```bash
./scripts/test.sh
```

## Feature Matrix

- RBAC Authentication: Admin / Manager / Staff
- Branch-wise Inventory + Purchase + Sales workflows
- Customer and Vendor management
- Invoice generation (PDF endpoint per sale)
- Low-stock alert notifications
- KPI dashboard: daily sales, margin, stock turnover
- Search/filter/pagination (catalog + inventory)
- CSV exports (inventory, sales) + PDF invoice export
- Audit-log timeline and notification center
- Responsive HTML/CSS UI
- Seed data generator and scripts for setup/run/tests

## Documentation

See `/docs`:
- `architecture.md`
- `api-spec.md`
- `db-schema.md`
- `runbook.md`
- `troubleshooting.md`
- `deployment-readiness-checklist.md`
