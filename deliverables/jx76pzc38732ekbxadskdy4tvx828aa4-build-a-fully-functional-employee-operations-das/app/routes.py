import csv
from io import StringIO
from datetime import datetime
from flask import render_template, request, redirect, url_for, flash, Response
from flask_login import login_user, logout_user, login_required, current_user
from .models import db, User, Department, Employee, Task, Attendance, LeaveRequest, AuditLog


def _audit(action, detail):
    db.session.add(AuditLog(action=action, detail=detail))


def _paginate(query, default=10):
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", default, type=int)
    return query.paginate(page=page, per_page=per_page, error_out=False)


def register_routes(app):
    @app.route("/")
    def home():
        if current_user.is_authenticated:
            return redirect(url_for("dashboard"))
        return redirect(url_for("login"))

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            username = request.form["username"].strip()
            password = request.form["password"]
            user = User.query.filter_by(username=username).first()
            if user and user.check_password(password):
                login_user(user)
                _audit("auth", f"{username} logged in")
                db.session.commit()
                return redirect(url_for("dashboard"))
            flash("Invalid credentials", "danger")
        return render_template("login.html")

    @app.route("/logout")
    @login_required
    def logout():
        _audit("auth", f"{current_user.username} logged out")
        db.session.commit()
        logout_user()
        return redirect(url_for("login"))

    @app.route("/dashboard")
    @login_required
    def dashboard():
        kpis = {
            "employees": Employee.query.count(),
            "departments": Department.query.count(),
            "open_tasks": Task.query.filter(Task.status != "done").count(),
            "pending_leaves": LeaveRequest.query.filter_by(status="pending").count(),
        }
        recent_audit = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(10).all()
        return render_template("dashboard.html", kpis=kpis, recent_audit=recent_audit)

    @app.route("/departments", methods=["GET", "POST"])
    @login_required
    def departments():
        if request.method == "POST":
            dep = Department(name=request.form["name"].strip(), location=request.form.get("location", "").strip())
            db.session.add(dep)
            _audit("department.create", dep.name)
            db.session.commit()
            return redirect(url_for("departments"))

        q = request.args.get("q", "").strip()
        query = Department.query
        if q:
            query = query.filter(Department.name.ilike(f"%{q}%"))
        rows = _paginate(query.order_by(Department.created_at.desc()))
        return render_template("departments.html", rows=rows, q=q)

    @app.route("/departments/<int:dep_id>/delete", methods=["POST"])
    @login_required
    def delete_department(dep_id):
        dep = Department.query.get_or_404(dep_id)
        _audit("department.delete", dep.name)
        db.session.delete(dep)
        db.session.commit()
        return redirect(url_for("departments"))

    @app.route("/employees", methods=["GET", "POST"])
    @login_required
    def employees():
        if request.method == "POST":
            emp = Employee(
                full_name=request.form["full_name"].strip(),
                email=request.form["email"].strip(),
                role=request.form["role"].strip(),
                status=request.form.get("status", "active"),
                department_id=int(request.form["department_id"]),
            )
            db.session.add(emp)
            _audit("employee.create", emp.full_name)
            db.session.commit()
            return redirect(url_for("employees"))

        q = request.args.get("q", "").strip()
        status = request.args.get("status", "")
        query = Employee.query
        if q:
            query = query.filter((Employee.full_name.ilike(f"%{q}%")) | (Employee.email.ilike(f"%{q}%")))
        if status:
            query = query.filter(Employee.status == status)
        rows = _paginate(query.order_by(Employee.created_at.desc()))
        return render_template("employees.html", rows=rows, q=q, status=status, departments=Department.query.all())

    @app.route("/employees/<int:emp_id>/update", methods=["POST"])
    @login_required
    def update_employee(emp_id):
        emp = Employee.query.get_or_404(emp_id)
        emp.role = request.form.get("role", emp.role)
        emp.status = request.form.get("status", emp.status)
        _audit("employee.update", emp.full_name)
        db.session.commit()
        return redirect(url_for("employees"))

    @app.route("/employees/<int:emp_id>/delete", methods=["POST"])
    @login_required
    def delete_employee(emp_id):
        emp = Employee.query.get_or_404(emp_id)
        _audit("employee.delete", emp.full_name)
        db.session.delete(emp)
        db.session.commit()
        return redirect(url_for("employees"))

    @app.route("/tasks", methods=["GET", "POST"])
    @login_required
    def tasks():
        if request.method == "POST":
            due = request.form.get("due_date")
            task = Task(
                title=request.form["title"].strip(),
                priority=request.form.get("priority", "medium"),
                status=request.form.get("status", "todo"),
                employee_id=int(request.form["employee_id"]),
                due_date=datetime.strptime(due, "%Y-%m-%d").date() if due else None,
            )
            db.session.add(task)
            _audit("task.create", task.title)
            db.session.commit()
            return redirect(url_for("tasks"))

        status = request.args.get("status", "")
        query = Task.query
        if status:
            query = query.filter(Task.status == status)
        rows = _paginate(query.order_by(Task.created_at.desc()))
        return render_template("tasks.html", rows=rows, status=status, employees=Employee.query.all())

    @app.route("/tasks/<int:task_id>/update", methods=["POST"])
    @login_required
    def update_task(task_id):
        task = Task.query.get_or_404(task_id)
        task.status = request.form.get("status", task.status)
        task.priority = request.form.get("priority", task.priority)
        _audit("task.update", task.title)
        db.session.commit()
        return redirect(url_for("tasks"))

    @app.route("/tasks/<int:task_id>/delete", methods=["POST"])
    @login_required
    def delete_task(task_id):
        task = Task.query.get_or_404(task_id)
        _audit("task.delete", task.title)
        db.session.delete(task)
        db.session.commit()
        return redirect(url_for("tasks"))

    @app.route("/attendance", methods=["GET", "POST"])
    @login_required
    def attendance():
        if request.method == "POST":
            row = Attendance(
                employee_id=int(request.form["employee_id"]),
                day=datetime.strptime(request.form["day"], "%Y-%m-%d").date(),
                check_in=request.form.get("check_in", ""),
                check_out=request.form.get("check_out", ""),
                status=request.form.get("status", "present"),
            )
            db.session.add(row)
            _audit("attendance.create", f"employee_id={row.employee_id}")
            db.session.commit()
            return redirect(url_for("attendance"))
        rows = _paginate(Attendance.query.order_by(Attendance.day.desc()))
        return render_template("attendance.html", rows=rows, employees=Employee.query.all())

    @app.route("/leaves", methods=["GET", "POST"])
    @login_required
    def leaves():
        if request.method == "POST":
            row = LeaveRequest(
                employee_id=int(request.form["employee_id"]),
                start_date=datetime.strptime(request.form["start_date"], "%Y-%m-%d").date(),
                end_date=datetime.strptime(request.form["end_date"], "%Y-%m-%d").date(),
                reason=request.form.get("reason", ""),
                status=request.form.get("status", "pending"),
            )
            db.session.add(row)
            _audit("leave.create", f"employee_id={row.employee_id}")
            db.session.commit()
            return redirect(url_for("leaves"))

        status = request.args.get("status", "")
        query = LeaveRequest.query
        if status:
            query = query.filter(LeaveRequest.status == status)
        rows = _paginate(query.order_by(LeaveRequest.created_at.desc()))
        return render_template("leaves.html", rows=rows, status=status, employees=Employee.query.all())

    @app.route("/leaves/<int:leave_id>/update", methods=["POST"])
    @login_required
    def update_leave(leave_id):
        row = LeaveRequest.query.get_or_404(leave_id)
        row.status = request.form.get("status", row.status)
        _audit("leave.update", f"leave_id={leave_id}")
        db.session.commit()
        return redirect(url_for("leaves"))

    @app.route("/audit")
    @login_required
    def audit():
        rows = _paginate(AuditLog.query.order_by(AuditLog.timestamp.desc()))
        return render_template("audit.html", rows=rows)

    @app.route("/export/<string:table>")
    @login_required
    def export_csv(table):
        output = StringIO()
        writer = csv.writer(output)

        if table == "employees":
            writer.writerow(["id", "full_name", "email", "role", "status", "department"])
            for r in Employee.query.all():
                writer.writerow([r.id, r.full_name, r.email, r.role, r.status, r.department.name])
        elif table == "tasks":
            writer.writerow(["id", "title", "priority", "status", "employee", "due_date"])
            for r in Task.query.all():
                writer.writerow([r.id, r.title, r.priority, r.status, r.employee.full_name, r.due_date])
        elif table == "attendance":
            writer.writerow(["id", "employee", "day", "status", "check_in", "check_out"])
            for r in Attendance.query.all():
                writer.writerow([r.id, r.employee.full_name, r.day, r.status, r.check_in, r.check_out])
        elif table == "leaves":
            writer.writerow(["id", "employee", "start_date", "end_date", "status", "reason"])
            for r in LeaveRequest.query.all():
                writer.writerow([r.id, r.employee.full_name, r.start_date, r.end_date, r.status, r.reason])
        else:
            return "unknown table", 404

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={table}.csv"},
        )
