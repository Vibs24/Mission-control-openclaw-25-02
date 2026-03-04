from functools import wraps
from pathlib import Path
import sqlite3

from flask import Flask, flash, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

from .db import close_db, get_db, init_db, seed_db


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY="dev-secret-change-me",
        DATABASE=str(Path(app.root_path).parent / "employee_notes.db"),
    )

    if test_config:
        app.config.update(test_config)

    app.teardown_appcontext(close_db)

    def login_required(view):
        @wraps(view)
        def wrapped_view(*args, **kwargs):
            if "user_id" not in session:
                return redirect(url_for("login"))
            return view(*args, **kwargs)

        return wrapped_view

    @app.get("/")
    def root():
        return redirect(url_for("dashboard"))

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if session.get("user_id"):
            return redirect(url_for("dashboard"))

        if request.method == "POST":
            username = request.form.get("username", "").strip()
            password = request.form.get("password", "")
            db = get_db()
            user = db.execute(
                "SELECT id, username, password_hash FROM users WHERE username = ?",
                (username,),
            ).fetchone()

            if user and check_password_hash(user["password_hash"], password):
                session.clear()
                session["user_id"] = user["id"]
                session["username"] = user["username"]
                return redirect(url_for("dashboard"))

            flash("Invalid credentials.", "error")

        return render_template("login.html")

    @app.get("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))

    @app.get("/dashboard")
    @login_required
    def dashboard():
        db = get_db()
        employees = db.execute(
            "SELECT id, name, email FROM employees ORDER BY id DESC"
        ).fetchall()
        notes = db.execute(
            "SELECT id, employee_id, content, created_at FROM notes ORDER BY id DESC"
        ).fetchall()
        notes_by_employee = {}
        for note in notes:
            notes_by_employee.setdefault(note["employee_id"], []).append(note)

        return render_template(
            "dashboard.html", employees=employees, notes_by_employee=notes_by_employee
        )

    @app.post("/employees")
    @login_required
    def create_employee():
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()

        if not name or not email:
            flash("Employee name and email are required.", "error")
            return redirect(url_for("dashboard"))

        db = get_db()
        try:
            db.execute("INSERT INTO employees (name, email) VALUES (?, ?)", (name, email))
            db.commit()
            flash("Employee created.", "success")
        except sqlite3.IntegrityError:
            flash("Employee email must be unique.", "error")

        return redirect(url_for("dashboard"))

    @app.post("/employees/<int:employee_id>/update")
    @login_required
    def update_employee(employee_id):
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()

        if not name or not email:
            flash("Employee name and email are required.", "error")
            return redirect(url_for("dashboard"))

        db = get_db()
        employee = db.execute(
            "SELECT id FROM employees WHERE id = ?", (employee_id,)
        ).fetchone()
        if employee is None:
            flash("Employee not found.", "error")
            return redirect(url_for("dashboard"))

        try:
            db.execute(
                "UPDATE employees SET name = ?, email = ? WHERE id = ?",
                (name, email, employee_id),
            )
            db.commit()
            flash("Employee updated.", "success")
        except sqlite3.IntegrityError:
            flash("Employee email must be unique.", "error")

        return redirect(url_for("dashboard"))

    @app.post("/employees/<int:employee_id>/delete")
    @login_required
    def delete_employee(employee_id):
        db = get_db()
        db.execute("DELETE FROM employees WHERE id = ?", (employee_id,))
        db.commit()
        flash("Employee deleted.", "success")
        return redirect(url_for("dashboard"))

    @app.post("/employees/<int:employee_id>/notes")
    @login_required
    def create_note(employee_id):
        content = request.form.get("content", "").strip()
        if not content:
            flash("Note content is required.", "error")
            return redirect(url_for("dashboard"))

        db = get_db()
        employee = db.execute(
            "SELECT id FROM employees WHERE id = ?", (employee_id,)
        ).fetchone()
        if employee is None:
            flash("Employee not found.", "error")
            return redirect(url_for("dashboard"))

        db.execute(
            "INSERT INTO notes (employee_id, content) VALUES (?, ?)",
            (employee_id, content),
        )
        db.commit()
        flash("Note created.", "success")
        return redirect(url_for("dashboard"))

    @app.post("/notes/<int:note_id>/update")
    @login_required
    def update_note(note_id):
        content = request.form.get("content", "").strip()
        if not content:
            flash("Note content is required.", "error")
            return redirect(url_for("dashboard"))

        db = get_db()
        note = db.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if note is None:
            flash("Note not found.", "error")
            return redirect(url_for("dashboard"))

        db.execute("UPDATE notes SET content = ? WHERE id = ?", (content, note_id))
        db.commit()
        flash("Note updated.", "success")
        return redirect(url_for("dashboard"))

    @app.post("/notes/<int:note_id>/delete")
    @login_required
    def delete_note(note_id):
        db = get_db()
        db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        db.commit()
        flash("Note deleted.", "success")
        return redirect(url_for("dashboard"))

    @app.cli.command("init-db")
    def init_db_command():
        init_db()
        seed_db()
        print("Initialized and seeded database.")

    return app
