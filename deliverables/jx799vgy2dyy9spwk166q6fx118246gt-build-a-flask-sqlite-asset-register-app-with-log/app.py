from __future__ import annotations
import csv
import io
import os
import sqlite3
from functools import wraps
from flask import Flask, Response, flash, g, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "assets.db")

app = Flask(__name__)
app.config.update(SECRET_KEY="asset-register-secret", DATABASE=DB_PATH, PER_PAGE=10)
PASSWORD_HASH_METHOD = "pbkdf2:sha256"


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_=None):
    db = g.pop("db", None)
    if db:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS assets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          owner TEXT NOT NULL,
          status TEXT NOT NULL,
          serial_number TEXT,
          location TEXT,
          notes TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    # Ensure seeded admin user exists with a hash method compatible with Python 3.9.
    admin = db.execute("SELECT id, password_hash FROM users WHERE username=?", ("admin",)).fetchone()
    admin_hash = generate_password_hash("admin123", method=PASSWORD_HASH_METHOD)
    if admin is None:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("admin", admin_hash),
        )
    elif (admin["password_hash"] or "").startswith("scrypt:"):
        db.execute(
            "UPDATE users SET password_hash=? WHERE id=?",
            (admin_hash, admin["id"]),
        )
    db.commit()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper


@app.route("/")
def index():
    return redirect(url_for("assets")) if session.get("user_id") else redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = get_db().execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        is_valid = False
        if user:
            try:
                is_valid = check_password_hash(user["password_hash"], password)
            except AttributeError:
                is_valid = False
        if is_valid:
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(url_for("assets"))
        flash("Invalid credentials", "danger")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


def parse_filters():
    q = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    status = request.args.get("status", "").strip()
    page = max(int(request.args.get("page", "1") or 1), 1)
    return q, category, status, page


def query_assets(q="", category="", status="", limit=None, offset=None):
    where = ["1=1"]
    params = []
    if q:
        where.append("(LOWER(name) LIKE ? OR LOWER(owner) LIKE ? OR LOWER(serial_number) LIKE ? OR LOWER(location) LIKE ?)")
        like = f"%{q.lower()}%"
        params.extend([like, like, like, like])
    if category:
        where.append("LOWER(category)=?")
        params.append(category.lower())
    if status:
        where.append("LOWER(status)=?")
        params.append(status.lower())

    sql = f"SELECT * FROM assets WHERE {' AND '.join(where)} ORDER BY datetime(updated_at) DESC, id DESC"
    if limit is not None and offset is not None:
        sql += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])
    rows = get_db().execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@app.route("/assets")
@login_required
def assets():
    q, category, status, page = parse_filters()
    per_page = app.config["PER_PAGE"]
    all_rows = query_assets(q, category, status)
    total = len(all_rows)
    pages = max((total + per_page - 1) // per_page, 1)
    page = min(page, pages)
    rows = query_assets(q, category, status, per_page, (page - 1) * per_page)

    categories = [r[0] for r in get_db().execute("SELECT DISTINCT category FROM assets ORDER BY category").fetchall()]
    statuses = [r[0] for r in get_db().execute("SELECT DISTINCT status FROM assets ORDER BY status").fetchall()]

    return render_template("assets.html", assets=rows, q=q, category=category, status=status, categories=categories, statuses=statuses, page=page, pages=pages, total=total)


@app.route("/assets/new", methods=["GET", "POST"])
@login_required
def create_asset():
    if request.method == "POST":
        data = {k: request.form.get(k, "").strip() for k in ["name", "category", "owner", "status", "serial_number", "location", "notes"]}
        if not all([data["name"], data["category"], data["owner"], data["status"]]):
            flash("Name, category, owner, and status are required.", "danger")
            return render_template("asset_form.html", asset=data, mode="create")
        get_db().execute(
            "INSERT INTO assets (name,category,owner,status,serial_number,location,notes,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
            (data["name"], data["category"], data["owner"], data["status"], data["serial_number"], data["location"], data["notes"]),
        )
        get_db().commit()
        flash("Asset created", "success")
        return redirect(url_for("assets"))
    return render_template("asset_form.html", asset={}, mode="create")


@app.route("/assets/<int:asset_id>/edit", methods=["GET", "POST"])
@login_required
def edit_asset(asset_id):
    db = get_db()
    row = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
    if not row:
        flash("Asset not found", "danger")
        return redirect(url_for("assets"))
    if request.method == "POST":
        data = {k: request.form.get(k, "").strip() for k in ["name", "category", "owner", "status", "serial_number", "location", "notes"]}
        if not all([data["name"], data["category"], data["owner"], data["status"]]):
            flash("Name, category, owner, and status are required.", "danger")
            return render_template("asset_form.html", asset=data, mode="edit", asset_id=asset_id)
        db.execute(
            "UPDATE assets SET name=?,category=?,owner=?,status=?,serial_number=?,location=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (data["name"], data["category"], data["owner"], data["status"], data["serial_number"], data["location"], data["notes"], asset_id),
        )
        db.commit()
        flash("Asset updated", "success")
        return redirect(url_for("assets"))
    return render_template("asset_form.html", asset=dict(row), mode="edit", asset_id=asset_id)


@app.post("/assets/<int:asset_id>/delete")
@login_required
def delete_asset(asset_id):
    get_db().execute("DELETE FROM assets WHERE id=?", (asset_id,))
    get_db().commit()
    flash("Asset deleted", "success")
    return redirect(url_for("assets"))


@app.route("/assets/export.csv")
@login_required
def export_csv():
    q, category, status, _ = parse_filters()
    rows = query_assets(q, category, status)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["id", "name", "category", "owner", "status", "serial_number", "location", "notes", "updated_at"])
    for r in rows:
        w.writerow([r["id"], r["name"], r["category"], r["owner"], r["status"], r["serial_number"], r["location"], r["notes"], r["updated_at"]])
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=assets_export.csv"})


with app.app_context():
    init_db()

if __name__ == "__main__":
    app.run(debug=True)
