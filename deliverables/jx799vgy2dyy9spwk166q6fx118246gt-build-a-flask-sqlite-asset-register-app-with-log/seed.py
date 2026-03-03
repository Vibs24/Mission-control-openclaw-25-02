from app import app, get_db
from werkzeug.security import generate_password_hash

with app.app_context():
    db = get_db()
    db.execute(
        "INSERT OR IGNORE INTO users (username,password_hash) VALUES (?,?)",
        ("admin", generate_password_hash("admin123", method="pbkdf2:sha256")),
    )
    sample = [
        ("MacBook Pro 16", "Laptop", "Engineering", "active", "MBP-2025-001", "HQ-2F", "Primary development machine"),
        ("iPhone 15", "Mobile", "Operations", "active", "IPH-OPS-019", "Field", "On-call handset"),
        ("Cisco Switch 48p", "Network", "IT", "maintenance", "SW-DC-004", "Datacenter", "Firmware upgrade scheduled"),
        ("Dell R740", "Server", "Platform", "retired", "SRV-LEG-011", "Storage", "Decommission pending wipe"),
    ]
    for row in sample:
        db.execute("INSERT INTO assets (name,category,owner,status,serial_number,location,notes) VALUES (?,?,?,?,?,?,?)", row)
    db.commit()
print("seed complete")
