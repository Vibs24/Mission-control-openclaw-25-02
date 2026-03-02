from __future__ import annotations
import csv
import io
import os
import sqlite3
from functools import wraps
from flask import Flask, Response, flash, g, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE = os.path.join(BASE_DIR, "reliability.db")

app = Flask(__name__)
app.config.update(SECRET_KEY="dev-secret-change-me", DATABASE=DATABASE)


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
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin','reviewer','viewer'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            workflow TEXT NOT NULL,
            status TEXT NOT NULL,
            blocked_reason TEXT,
            rca TEXT,
            assigned_agent TEXT NOT NULL,
            utilization_pct INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    db.commit()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper


def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if session.get("role") not in roles:
                flash("Insufficient permissions.", "danger")
                return redirect(url_for("dashboard"))
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def fetch_tasks():
    rows = get_db().execute(
        "SELECT * FROM tasks ORDER BY datetime(updated_at) DESC, id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def task_metrics(tasks):
    metrics = {
        "total": len(tasks),
        "blocked": sum(1 for t in tasks if t["status"].lower() == "blocked"),
        "stuck": sum(1 for t in tasks if t["status"].lower() == "stuck"),
        "in_progress": sum(1 for t in tasks if t["status"].lower() == "in_progress"),
    }
    per_agent = {}
    for t in tasks:
        ag = t["assigned_agent"]
        per_agent.setdefault(ag, {"count": 0, "util_sum": 0})
        per_agent[ag]["count"] += 1
        per_agent[ag]["util_sum"] += t["utilization_pct"]
    widgets = []
    for ag, v in sorted(per_agent.items()):
        widgets.append({"agent": ag, "task_count": v["count"], "avg_utilization": round(v["util_sum"] / max(v["count"], 1), 1)})
    rca_panel = [t for t in tasks if t["status"].lower() in ("blocked", "stuck")]
    return metrics, widgets, rca_panel


@app.route("/")
@login_required
def dashboard():
    tasks = fetch_tasks()
    metrics, widgets, rca_panel = task_metrics(tasks)
    return render_template("dashboard.html", tasks=tasks, metrics=metrics, widgets=widgets, rca_panel=rca_panel)


@app.route("/api/tasks")
@login_required
def api_tasks():
    tasks = fetch_tasks()
    return jsonify(tasks)


@app.route("/export/tasks.csv")
@login_required
def export_csv():
    tasks = fetch_tasks()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["id", "title", "workflow", "status", "blocked_reason", "rca", "assigned_agent", "utilization_pct", "updated_at"])
    for t in tasks:
        w.writerow([t["id"], t["title"], t["workflow"], t["status"], t["blocked_reason"], t["rca"], t["assigned_agent"], t["utilization_pct"], t["updated_at"]])
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=tasks.csv"})


@app.route("/tasks/<int:task_id>/update", methods=["POST"])
@login_required
@role_required("admin", "reviewer")
def update_task(task_id):
    status = request.form.get("status", "").strip()
    blocked_reason = request.form.get("blocked_reason", "").strip()
    rca = request.form.get("rca", "").strip()
    util = int(request.form.get("utilization_pct", "0"))
    if status not in {"todo", "in_progress", "blocked", "stuck", "review", "done"}:
        flash("Invalid status", "danger")
        return redirect(url_for("dashboard"))
    get_db().execute(
        "UPDATE tasks SET status=?, blocked_reason=?, rca=?, utilization_pct=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (status, blocked_reason, rca, util, task_id),
    )
    get_db().commit()
    flash("Task updated.", "success")
    return redirect(url_for("dashboard"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = get_db().execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["role"] = user["role"]
            return redirect(url_for("dashboard"))
        flash("Invalid credentials", "danger")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(debug=True)
