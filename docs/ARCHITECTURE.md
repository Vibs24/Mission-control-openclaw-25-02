# Architecture

## Overview
RetailOps is a server-rendered Flask application using SQLite for transactional retail data.

## Layers
1. Presentation: Jinja2 templates + responsive CSS + small JS helpers.
2. Application: Flask routes implement RBAC, workflows, exports, and KPIs.
3. Data: SQLite relational schema with foreign keys enabled.

## Security Model
- Session-based auth
- Password hashes using Werkzeug (`generate_password_hash`)
- Role hierarchy:
  - admin: full access
  - manager: operational + audit/vendor/purchase
  - staff: sales/inventory/customer/notifications
- Branch scoping for non-admin roles.

## Core Workflows
- Purchases increase inventory and write audit logs.
- Sales validate stock, create invoice lines, reduce inventory, trigger low-stock notifications.
- Dashboard computes KPI values from live transactional tables.
