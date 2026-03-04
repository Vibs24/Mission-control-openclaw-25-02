from pathlib import Path
from flask import Flask, render_template, request, redirect, url_for, session, flash
from .db import get_db, close_db, init_db, seed_db


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY="dev-secret-change-me",
        DATABASE=str(Path(app.root_path).parent / "employee_notes.db"),
    )
    if test_config:
        app.config.update(test_config)

    app.teardown_appcontext(close_db)

    @app.get("/")
    def index():
        if "user" not in session:
            return redirect(url_for("login"))
        db = get_db()
        q = request.args.get("q", "").strip()
        if q:
            notes = db.execute(
                """
                SELECT * FROM notes
                WHERE employee_name LIKE ? OR title LIKE ? OR content LIKE ?
                ORDER BY id DESC
                """,
                (f"%{q}%", f"%{q}%", f"%{q}%"),
            ).fetchall()
        else:
            notes = db.execute("SELECT * FROM notes ORDER BY id DESC").fetchall()
        return render_template("index.html", notes=notes, q=q)

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            username = request.form["username"].strip()
            password = request.form["password"]
            db = get_db()
            user = db.execute(
                "SELECT * FROM users WHERE username=? AND password=?", (username, password)
            ).fetchone()
            if user:
                session["user"] = username
                return redirect(url_for("index"))
            flash("Invalid credentials", "error")
        return render_template("login.html")

    @app.get("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))

    def require_auth():
        if "user" not in session:
            return redirect(url_for("login"))
        return None

    @app.route("/notes/create", methods=["GET", "POST"])
    def create_note():
        auth = require_auth()
        if auth:
            return auth
        if request.method == "POST":
            employee_name = request.form["employee_name"].strip()
            title = request.form["title"].strip()
            content = request.form["content"].strip()
            if not employee_name or not title:
                flash("Employee name and title are required", "error")
            else:
                db = get_db()
                db.execute(
                    "INSERT INTO notes (employee_name, title, content, created_by) VALUES (?, ?, ?, ?)",
                    (employee_name, title, content, session["user"]),
                )
                db.commit()
                return redirect(url_for("index"))
        return render_template("form.html", note=None)

    @app.route("/notes/<int:note_id>/edit", methods=["GET", "POST"])
    def edit_note(note_id):
        auth = require_auth()
        if auth:
            return auth
        db = get_db()
        note = db.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
        if note is None:
            return redirect(url_for("index"))
        if request.method == "POST":
            employee_name = request.form["employee_name"].strip()
            title = request.form["title"].strip()
            content = request.form["content"].strip()
            db.execute(
                "UPDATE notes SET employee_name=?, title=?, content=? WHERE id=?",
                (employee_name, title, content, note_id),
            )
            db.commit()
            return redirect(url_for("index"))
        return render_template("form.html", note=note)

    @app.post("/notes/<int:note_id>/delete")
    def delete_note(note_id):
        auth = require_auth()
        if auth:
            return auth
        db = get_db()
        db.execute("DELETE FROM notes WHERE id=?", (note_id,))
        db.commit()
        return redirect(url_for("index"))

    @app.cli.command("init-db")
    def init_db_command():
        init_db()
        seed_db()
        print("Initialized and seeded database.")

    return app
