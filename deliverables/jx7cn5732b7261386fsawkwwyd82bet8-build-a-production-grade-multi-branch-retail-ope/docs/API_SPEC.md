# API / Route Spec

## Auth
- `GET|POST /login` - authenticate user
- `GET /logout` - clear session

## Dashboard & Ops
- `GET /dashboard` - KPI + low-stock + notifications
- `GET|POST /inventory` - list/add products and stock
- `GET|POST /purchase` - record inbound stock purchase
- `GET|POST /sales` - record sale and generate invoice
- `GET /invoice/<sale_id>` - invoice HTML view
- `GET /invoice/<sale_id>/pdf` - invoice PDF download

## Masters
- `GET|POST /customers`
- `GET|POST /vendors`

## Governance
- `GET /audit` - audit timeline (admin/manager)
- `GET /notifications`

## Exports
- `GET /export/<entity>.csv` where entity in: inventory, sales, purchases, customers, vendors, audit
