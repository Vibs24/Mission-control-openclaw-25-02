from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user
from . import db
from .models import User, Employee, Note

bp = Blueprint("main", __name__)


@bp.route("/")
def home():
    if current_user.is_authenticated:
        return redirect(url_for("main.employees"))
    return redirect(url_for("main.login"))


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.employees"))
    if request.method == "POST":
        user = User.query.filter_by(username=request.form["username"].strip()).first()
        if user and user.check_password(request.form["password"]):
            login_user(user)
            return redirect(url_for("main.employees"))
        flash("Invalid credentials", "danger")
    return render_template("login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("main.login"))


@bp.route("/employees", methods=["GET", "POST"])
@login_required
def employees():
    if request.method == "POST":
        e = Employee(name=request.form["name"], email=request.form["email"])
        db.session.add(e)
        db.session.commit()
        flash("Employee created", "success")
        return redirect(url_for("main.employees"))
    return render_template("employees.html", employees=Employee.query.order_by(Employee.name).all())


@bp.route("/employees/<int:eid>/delete", methods=["POST"])
@login_required
def delete_employee(eid):
    e = Employee.query.get_or_404(eid)
    db.session.delete(e)
    db.session.commit()
    flash("Employee deleted", "warning")
    return redirect(url_for("main.employees"))


@bp.route("/notes", methods=["GET", "POST"])
@login_required
def notes():
    if request.method == "POST":
        n = Note(
            title=request.form["title"],
            body=request.form.get("body"),
            employee_id=int(request.form["employee_id"]),
        )
        db.session.add(n)
        db.session.commit()
        flash("Note created", "success")
        return redirect(url_for("main.notes"))
    notes_list = Note.query.order_by(Note.id.desc()).all()
    return render_template("notes.html", notes=notes_list, employees=Employee.query.order_by(Employee.name).all())


@bp.route("/notes/<int:nid>/edit", methods=["GET", "POST"])
@login_required
def edit_note(nid):
    note = Note.query.get_or_404(nid)
    if request.method == "POST":
        note.title = request.form["title"]
        note.body = request.form.get("body")
        note.employee_id = int(request.form["employee_id"])
        db.session.commit()
        flash("Note updated", "success")
        return redirect(url_for("main.notes"))
    return render_template("note_edit.html", note=note, employees=Employee.query.order_by(Employee.name).all())


@bp.route("/notes/<int:nid>/delete", methods=["POST"])
@login_required
def delete_note(nid):
    note = Note.query.get_or_404(nid)
    db.session.delete(note)
    db.session.commit()
    flash("Note deleted", "warning")
    return redirect(url_for("main.notes"))
