# API Specification

Mostly server-rendered routes plus one JSON endpoint.

## Auth
- `GET/POST /login`
- `GET /logout`

## Dashboard
- `GET /dashboard` KPI cards
- `GET /api/kpis` JSON `{daily_sales,total_margin,stock_turnover}`

## Inventory
- `GET /inventory?q=&page=`
- `GET /inventory/export.csv`

## Customers
- `GET/POST /customers`

## Vendors
- `GET/POST /vendors`

## Purchases
- `GET/POST /purchases`

## Sales
- `GET /sales?q=&page=`
- `GET /sales/new`
- `POST /sales/new`
- `GET /sales/export.csv`

## Invoices
- `GET /invoice/<sale_id>`
- `GET /invoice/<sale_id>.pdf`

## Notifications
- `GET/POST /notifications`

## Audit
- `GET /audit?q=&page=`
