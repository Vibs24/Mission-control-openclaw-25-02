# DB Schema Summary

- **branch**: branch master
- **user**: credential + role + branch mapping
- **product**: SKU catalog with cost/sell prices
- **inventory**: stock by branch/product + reorder levels
- **vendor**: procurement counterparties
- **customer**: retail customers
- **purchase**: incoming stock transactions
- **sale**: sales headers (amount/cost/date)
- **sale_item**: sales lines (qty, unit prices)
- **notification**: low-stock and ops alerts
- **audit_log**: action timeline for traceability

Refer to `app/models.py` for exact field definitions and constraints.
