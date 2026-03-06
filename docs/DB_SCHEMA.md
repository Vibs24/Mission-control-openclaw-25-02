# Database Schema

See `schema.sql` for exact DDL.

## Main Entities
- `branches`
- `users` (role + optional branch)
- `vendors`, `customers` (branch-owned)
- `products` (branch-owned)
- `inventory` (1:1 with product)
- `purchases` (stock-in ledger)
- `sales` + `sales_items` (stock-out + invoice)
- `notifications`
- `audit_logs`

## Constraints
- Foreign keys on all transactional references
- Role check constraint: `admin|manager|staff`
- Unique SKU and username
- Inventory row unique per product
