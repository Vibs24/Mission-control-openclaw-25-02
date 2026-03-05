# API Spec (Route-Level)

## Auth
- `GET/POST /login`
- `GET /logout`

## Dashboard
- `GET /dashboard`

## Master Data
- `GET/POST /branches` (Admin)
- `GET/POST /catalog` (Admin/Manager)
- `GET/POST /vendors`
- `GET/POST /customers`

## Operations
- `GET/POST /inventory`
- `GET/POST /purchases` (Admin/Manager)
- `GET/POST /sales`

## Reporting/Export
- `GET /invoice/<sale_id>.pdf`
- `GET /export/inventory.csv`
- `GET /export/sales.csv`

## Monitoring
- `GET /notifications`
- `GET /audit`

## RBAC
- Admin: full access
- Manager: operational + catalog/purchase
- Staff: sales/inventory/customers/vendors/dashboard/exports
