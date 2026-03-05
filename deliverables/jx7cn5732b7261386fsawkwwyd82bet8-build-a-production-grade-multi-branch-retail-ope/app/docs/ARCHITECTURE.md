# Architecture
- Flask monolith with layered modules: auth, master-data, inventory, purchasing, sales, notifications, audit.
- SQLite persistence through SQLAlchemy models.
- Server-rendered Bootstrap UI.
- Export layer for CSV/PDF.
