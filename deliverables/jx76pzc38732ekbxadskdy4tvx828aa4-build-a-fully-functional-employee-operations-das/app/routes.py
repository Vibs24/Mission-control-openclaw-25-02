import csv
from datetime import datetime
from io import StringIO
from flask import Blueprint, flash, redirect, render_template, request, url_for, Response
from flask_login import current_user, login_required, login_user, logout_user
from . import db
from .models import AuditLog, Attendance, Department, Employee, Leave, Task, User

bp = Blueprint("main", __name__)


def log_event(entity_type, entity_id, action, message):
    db.session.add(
        AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            message=message,
            actor=current_user.username if current_user.is_authenticated else "system",
        )
    )


def paginate(query, default=10):
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", default, type=int)
    return query.paginate(page=page, per_page=per_page, error_out=False)


@bp.route("/")
def root():
    return redirect(url_for("main.dashboard") if current_user.is_authenticated else url_for("main.login"))


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    if request.method == "POST":
        user = User.query.filter_by(username=request.form["username"].strip()).first()
        if user and user.check_password(request.form["password"]):
            login_user(user)
            log_event("auth", user.id, "login", f"User {user.username} logged in")
            db.session.commit()
            return redirect(url_for("main.dashboard"))
        flash("Invalid username or password", "danger")
    return render_template("login.html")


@bp.route("/logout")
@login_required
def logout():
    log_event("auth", current_user.id, "logout", f"User {current_user.username} logged out")
    db.session.commit()
    logout_user()
    return redirect(url_for("main.login"))


@bp.route("/dashboard")
@login_required
def dashboard():
    kpis = {
        "employees": Employee.query.count(),
        "departments": Department.query.count(),
        "open_tasks": Task.query.filter(Task.status != "Done").count(),
        "pending_leaves": Leave.query.filter_by(status="Pending").count(),
    }
    recent_logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(8).all()
    return render_template("dashboard.html", kpis=kpis, recent_logs=recent_logs)


@bp.route("/employees", methods=["GET", "POST"])
@login_required
def employees():
    if request.method == "POST":
        e = Employee(
            employee_code=request.form["employee_code"],
            full_name=request.form["full_name"],
            email=request.form["email"],
            role=request.form["role"],
            status=request.form["status"],
            joining_date=datetime.strptime(request.form["joining_date"], "%Y-%m-%d").date(),
            department_id=int(request.form["department_id"]),
        )
        db.session.add(e)
        db.session.flush()
        log_event("employee", e.id, "create", f"Employee created: {e.full_name}")
        db.session.commit()
        flash("Employee created", "success")
        return redirect(url_for("main.employees"))

    q = request.args.get("q", "").strip()
    status = request.args.get("status", "")
    dept_id = request.args.get("department_id", type=int)
    query = Employee.query
    if q:
        query = query.filter(Employee.full_name.contains(q) | Employee.email.contains(q) | Employee.employee_code.contains(q))
    if status:
        query = query.filter_by(status=status)
    if dept_id:
        query = query.filter_by(department_id=dept_id)

    pagination = paginate(query.order_by(Employee.full_name.asc()))
    return render_template(
        "employees.html",
        pagination=pagination,
        departments=Department.query.order_by(Department.name).all(),
        q=q,
        selected_status=status,
        selected_dept=dept_id,
    )


@bp.route("/employees/<int:eid>/delete", methods=["POST"])
@login_required
def delete_employee(eid):
    e = Employee.query.get_or_404(eid)
    name = e.full_name
    db.session.delete(e)
    log_event("employee", eid, "delete", f"Employee deleted: {name}")
    db.session.commit()
    flash("Employee deleted", "warning")
    return redirect(url_for("main.employees"))


@bp.route("/departments", methods=["GET", "POST"])
@login_required
def departments():
    if request.method == "POST":
        d = Department(name=request.form["name"], description=request.form.get("description"))
        db.session.add(d)
        db.session.flush()
        log_event("department", d.id, "create", f"Department created: {d.name}")
        db.session.commit()
        flash("Department added", "success")
        return redirect(url_for("main.departments"))

    query = Department.query
    q = request.args.get("q", "").strip()
    if q:
        query = query.filter(Department.name.contains(q))
    pagination = paginate(query.order_by(Department.name.asc()))
    return render_template("departments.html", pagination=pagination, q=q)


@bp.route("/departments/<int:did>/delete", methods=["POST"])
@login_required
def delete_department(did):
    d = Department.query.get_or_404(did)
    if d.employees:
        flash("Cannot delete non-empty department", "danger")
        return redirect(url_for("main.departments"))
    name = d.name
    db.session.delete(d)
    log_event("department", did, "delete", f"Department deleted: {name}")
    db.session.commit()
    flash("Department deleted", "warning")
    return redirect(url_for("main.departments"))


@bp.route("/tasks", methods=["GET", "POST"])
@login_required
def tasks():
    if request.method == "POST":
        due_date = request.form.get("due_date")
        t = Task(
            title=request.form["title"],
            description=request.form.get("description"),
            priority=request.form["priority"],
            status=request.form["status"],
            due_date=datetime.strptime(due_date, "%Y-%m-%d").date() if due_date else None,
            employee_id=int(request.form["employee_id"]),
        )
        db.session.add(t)
        db.session.flush()
        log_event("task", t.id, "create", f"Task created: {t.title}")
        db.session.commit()
        flash("Task created", "success")
        return redirect(url_for("main.tasks"))

    q = request.args.get("q", "").strip()
    status = request.args.get("status", "")
    query = Task.query
    if q:
        query = query.filter(Task.title.contains(q))
    if status:
        query = query.filter_by(status=status)
    pagination = paginate(query.order_by(Task.id.desc()))
    return render_template("tasks.html", pagination=pagination, q=q, selected_status=status, employees=Employee.query.all())


@bp.route("/tasks/<int:tid>/delete", methods=["POST"])
@login_required
def delete_task(tid):
    t = Task.query.get_or_404(tid)
    title = t.title
    db.session.delete(t)
    log_event("task", tid, "delete", f"Task deleted: {title}")
    db.session.commit()
    return redirect(url_for("main.tasks"))


@bp.route("/attendance", methods=["GET", "POST"])
@login_required
def attendance():
    if request.method == "POST":
        rec = Attendance(
            employee_id=int(request.form["employee_id"]),
            day=datetime.strptime(request.form["day"], "%Y-%m-%d").date(),
            status=request.form["status"],
            check_in=request.form.get("check_in"),
            check_out=request.form.get("check_out"),
        )
        db.session.add(rec)
        db.session.flush()
        log_event("attendance", rec.id, "create", f"Attendance marked for {rec.employee.full_name}")
        db.session.commit()
        return redirect(url_for("main.attendance"))

    day_filter = request.args.get("day")
    query = Attendance.query
    if day_filter:
        query = query.filter_by(day=datetime.strptime(day_filter, "%Y-%m-%d").date())
    pagination = paginate(query.order_by(Attendance.day.desc()))
    return render_template("attendance.html", pagination=pagination, employees=Employee.query.all(), day_filter=day_filter)


@bp.route("/leaves", methods=["GET", "POST"])
@login_required
def leaves():
    if request.method == "POST":
        l = Leave(
            employee_id=int(request.form["employee_id"]),
            leave_type=request.form["leave_type"],
            start_date=datetime.strptime(request.form["start_date"], "%Y-%m-%d").date(),
            end_date=datetime.strptime(request.form["end_date"], "%Y-%m-%d").date(),
            status=request.form["status"],
            reason=request.form.get("reason"),
        )
        db.session.add(l)
        db.session.flush()
        log_event("leave", l.id, "create", f"Leave request for {l.employee.full_name}")
        db.session.commit()
        return redirect(url_for("main.leaves"))

    status = request.args.get("status", "")
    query = Leave.query
    if status:
        query = query.filter_by(status=status)
    pagination = paginate(query.order_by(Leave.start_date.desc()))
    return render_template("leaves.html", pagination=pagination, employees=Employee.query.all(), selected_status=status)


@bp.route("/export/<string:entity>.csv")
@login_required
def export_csv(entity):
    output = StringIO()
    writer = csv.writer(output)

    if entity == "employees":
        writer.writerow(["Code", "Name", "Email", "Role", "Status", "Department"])
        for e in Employee.query.order_by(Employee.full_name).all():
            writer.writerow([e.employee_code, e.full_name, e.email, e.role, e.status, e.department.name])
    elif entity == "tasks":
        writer.writerow(["Title", "Employee", "Priority", "Status", "Due Date"])
        for t in Task.query.order_by(Task.id.desc()).all():
            writer.writerow([t.title, t.employee.full_name, t.priority, t.status, t.due_date])
    else:
        return "Unsupported export", 400

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={entity}.csv"},
    )
