from app import create_app
from app.db import init_db, seed_db

app = create_app()

with app.app_context():
    init_db()
    seed_db()
    print("Database initialized and seeded at", app.config["DATABASE"])
