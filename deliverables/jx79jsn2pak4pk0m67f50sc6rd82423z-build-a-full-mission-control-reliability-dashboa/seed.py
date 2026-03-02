from app import app, get_db
from werkzeug.security import generate_password_hash

USERS = [
    ("admin", "admin123", "admin"),
    ("reviewer", "review123", "reviewer"),
    ("viewer", "viewer123", "viewer"),
]

TASKS = [
    ("Investigate digest lag", "incident", "blocked", "telegram_digest_timeout", "Queue saturation under burst load", "dev", 88),
    ("Validate reviewer SLA", "review", "stuck", "reviewer_overload", "Manual review queue exceeded threshold", "steve", 91),
    ("Parallel workflow smoke", "task", "in_progress", "", "", "bruce", 72),
    ("Dispatch recovery replay", "debug", "review", "", "Recovered after retry with slot release", "natasha", 65),
]

with app.app_context():
    db = get_db()
    for u, p, r in USERS:
        db.execute(
            "INSERT OR IGNORE INTO users (username,password_hash,role) VALUES (?,?,?)",
            (u, generate_password_hash(p), r),
        )
    for t in TASKS:
        db.execute(
            "INSERT INTO tasks (title,workflow,status,blocked_reason,rca,assigned_agent,utilization_pct) VALUES (?,?,?,?,?,?,?)",
            t,
        )
    db.commit()

print("seed complete")
