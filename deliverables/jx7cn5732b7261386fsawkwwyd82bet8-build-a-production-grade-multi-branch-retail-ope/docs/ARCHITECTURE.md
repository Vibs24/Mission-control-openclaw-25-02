# Architecture

## Stack
- Flask web layer (server-rendered Jinja templates)
- SQLite transactional store
- ReportLab for PDF invoice export

## Layers
1. **Presentation**: templates + CSS responsive UI
2. **Application**: Flask routes enforcing RBAC and business rules
3. **Data**: SQLite with normalized tables for branches/users/products/inventory/transactions/audit

## Key Design Notes
- Session-based authentication for simplicity and clear integration testing.
- Role checks via decorator for consistent RBAC enforcement.
- Audit logging on auth and transactional operations.
- Notification records for low-stock and operational events.
