# API / Route Spec

## Auth
- `GET|POST /login` - authenticate user
- `GET /logout` - clear session

## Dashboard & Ops
- `GET /dashboard` - KPI + low-stock + notifications
- `GET|POST /branches` - branch management (admin create)
- `GET|POST /inventory` - list/add products and stock
- `GET|POST /purchases` - record inbound stock purchases
- `GET /sales` - list sales
- `GET|POST /sales/new` - create sale and generate invoice
- `GET /invoice/<sale_id>` - invoice HTML view
- `GET /invoice/<sale_id>.pdf` - invoice PDF download

## Masters
- `GET|POST /customers`
- `GET|POST /vendors`

## Governance
- `GET /audit` - audit timeline (admin/manager)
- `GET /notifications`

## Exports
- `GET /export/<entity>.csv` where entity in: branches, inventory, sales, purchases, customers, vendors, audit
- `GET /export/<entity>.pdf` same entities as CSV
