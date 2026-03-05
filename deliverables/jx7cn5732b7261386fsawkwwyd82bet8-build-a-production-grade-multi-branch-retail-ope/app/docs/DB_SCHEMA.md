# DB Schema
Core entities: User, Branch, Product, Inventory, Vendor, Customer, Purchase, Sale, Notification, AuditLog.
Relationships:
- User -> Branch (many-to-one)
- Inventory -> Branch/Product
- Purchase -> Branch/Vendor/Product
- Sale -> Branch/Customer/Product
