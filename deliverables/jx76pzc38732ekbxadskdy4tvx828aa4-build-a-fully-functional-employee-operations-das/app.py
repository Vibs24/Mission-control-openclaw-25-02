import csv
import os
from datetime import date, datetime
from io import StringIO

from flask import Flask, flash, redirect, render_template, request, url_for, Response
from flask_login import LoginManager, UserMixin, current_user, login_required, login_user, logout_user
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = "login"


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY="change-me-in-production",
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{os.path.join(BASE_DIR, 'employee_ops.db')}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    login_manager.init_app(app)

    with app.app_context():
        db.create_all()

    register_routes(app)
    return app


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)


class Department(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.String(255))
    employees = db.relationship("Employee", backref="department", lazy=True)


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    role = db.Column(db.String(120), nullable=False)
    status = db.Column(db.String(20), default="active")
    department_id = db.Column(db.Integer, db.ForeignKey("department.id"))
    attendance = db.relationship("Attendance", backref="employee", lazy=True, cascade="all, delete-orphan")
    leaves = db.relationship("LeaveRequest", backref="employee", lazy=True, cascade="all, delete-orphan")
    tasks = db.relationship("Task", backref="employee", lazy=True, cascade="all, delete-orphan")


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    priority = db.Column(db.String(20), default="medium")
    status = db.Column(db.String(20), default="open")
    due_date = db.Column(db.Date)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)


class Attendance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    day = db.Column(db.Date, default=date.today)
    status = db.Column(db.String(20), default="present")
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)


class LeaveRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default="pending")
    reason = db.Column(db.String(255))
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    actor = db.Column(db.String(80), nullable=False)
    action = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


def add_audit(action):
    actor = current_user.username if current_user.is_authenticated else "system"
    db.session.add(AuditLog(actor=actor, action=action))
    db.session.commit()


def paginate(query, page, per_page=8):
    return query.paginate(page=page, per_page=per_page, error_out=False)


def csv_response(filename, rows, headers):
    s = StringIO()
    writer = csv.writer(s)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return Response(
        s.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename={filename}"},
    )


def register_routes(app):
    @app.route("/")
    def index():
        return redirect(url_for("dashboard") if current_user.is_authenticated else url_for("login"))

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            username = request.form["username"]
            password = request.form["password"]
            user = User.query.filter_by(username=username).first()
            if user and check_password_hash(user.password_hash, password):
                login_user(user)
                add_audit("Logged in")
                return redirect(url_for("dashboard"))
            flash("Invalid credentials", "danger")
        return render_template("login.html")

    @app.route("/logout")
    @login_required
    def logout():
        add_audit("Logged out")
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
        recent_logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(8).all()
        return render_template("dashboard.html", kpis=kpis, recent_logs=recent_logs)

    @app.route("/employees", methods=["GET", "POST"])
    @login_required
    def employees():
        if request.method == "POST":
            emp = Employee(
                name=request.form["name"],
                email=request.form["email"],
                role=request.form["role"],
                status=request.form["status"],
                department_id=request.form.get("department_id") or None,
            )
            db.session.add(emp)
            db.session.commit()
            add_audit(f"Created employee {emp.name}")
            return redirect(url_for("employees"))

        search = request.args.get("search", "")
        status = request.args.get("status", "")
        page = int(request.args.get("page", 1))
        q = Employee.query
        if search:
            q = q.filter((Employee.name.ilike(f"%{search}%")) | (Employee.email.ilike(f"%{search}%")))
        if status:
            q = q.filter_by(status=status)
        data = paginate(q.order_by(Employee.id.desc()), page)
        return render_template("employees.html", data=data, departments=Department.query.all(), search=search, status=status)

    @app.route("/employees/<int:emp_id>/delete", methods=["POST"])
    @login_required
    def delete_employee(emp_id):
        emp = Employee.query.get_or_404(emp_id)
        name = emp.name
        db.session.delete(emp)
        db.session.commit()
        add_audit(f"Deleted employee {name}")
        return redirect(url_for("employees"))

    @app.route("/departments", methods=["GET", "POST"])
    @login_required
    def departments():
        if request.method == "POST":
            dep = Department(name=request.form["name"], description=request.form.get("description"))
            db.session.add(dep)
            db.session.commit()
            add_audit(f"Created department {dep.name}")
            return redirect(url_for("departments"))
        return render_template("departments.html", departments=Department.query.order_by(Department.name).all())

    @app.route("/departments/<int:dep_id>/delete", methods=["POST"])
    @login_required
    def delete_department(dep_id):
        dep = Department.query.get_or_404(dep_id)
        if dep.employees:
            flash("Cannot delete department with employees", "warning")
            return redirect(url_for("departments"))
        db.session.delete(dep)
        db.session.commit()
        add_audit(f"Deleted department {dep.name}")
        return redirect(url_for("departments"))

    @app.route("/tasks", methods=["GET", "POST"])
    @login_required
    def tasks():
        if request.method == "POST":
            due = request.form.get("due_date")
            task = Task(
                title=request.form["title"],
                priority=request.form["priority"],
                status=request.form["status"],
                due_date=datetime.strptime(due, "%Y-%m-%d").date() if due else None,
                employee_id=request.form["employee_id"],
            )
            db.session.add(task)
            db.session.commit()
            add_audit(f"Created task {task.title}")
            return redirect(url_for("tasks"))
        employee_id = request.args.get("employee_id", type=int)
        page = int(request.args.get("page", 1))
        q = Task.query
        if employee_id:
            q = q.filter_by(employee_id=employee_id)
        data = paginate(q.order_by(Task.id.desc()), page)
        return render_template("tasks.html", data=data, employees=Employee.query.order_by(Employee.name).all(), filter_emp=employee_id)

    @app.route("/tasks/<int:task_id>/delete", methods=["POST"])
    @login_required
    def delete_task(task_id):
        task = Task.query.get_or_404(task_id)
        title = task.title
        db.session.delete(task)
        db.session.commit()
        add_audit(f"Deleted task {title}")
        return redirect(url_for("tasks"))

    @app.route("/attendance", methods=["GET", "POST"])
    @login_required
    def attendance():
        if request.method == "POST":
            rec = Attendance(
                employee_id=request.form["employee_id"],
                day=datetime.strptime(request.form["day"], "%Y-%m-%d").date(),
                status=request.form["status"],
            )
            db.session.add(rec)
            db.session.commit()
            add_audit("Added attendance record")
            return redirect(url_for("attendance"))
        rows = Attendance.query.order_by(Attendance.day.desc()).limit(50).all()
        return render_template("attendance.html", rows=rows, employees=Employee.query.order_by(Employee.name).all())

    @app.route("/leaves", methods=["GET", "POST"])
    @login_required
    def leaves():
        if request.method == "POST":
            req = LeaveRequest(
                employee_id=request.form["employee_id"],
                start_date=datetime.strptime(request.form["start_date"], "%Y-%m-%d").date(),
                end_date=datetime.strptime(request.form["end_date"], "%Y-%m-%d").date(),
                status=request.form["status"],
                reason=request.form.get("reason"),
            )
            db.session.add(req)
            db.session.commit()
            add_audit("Created leave request")
            return redirect(url_for("leaves"))
        rows = LeaveRequest.query.order_by(LeaveRequest.start_date.desc()).limit(50).all()
        return render_template("leaves.html", rows=rows, employees=Employee.query.order_by(Employee.name).all())

    @app.route("/audit")
    @login_required
    def audit():
        rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(100).all()
        return render_template("audit.html", rows=rows)

    @app.route("/export/<string:entity>.csv")
    @login_required
    def export_csv(entity):
        if entity == "employees":
            rows = [(e.id, e.name, e.email, e.role, e.status, e.department.name if e.department else "") for e in Employee.query.all()]
            return csv_response("employees.csv", rows, ["id", "name", "email", "role", "status", "department"])
        if entity == "tasks":
            rows = [(t.id, t.title, t.priority, t.status, t.employee.name, t.due_date or "") for t in Task.query.all()]
            return csv_response("tasks.csv", rows, ["id", "title", "priority", "status", "employee", "due_date"])
        if entity == "attendance":
            rows = [(a.id, a.employee.name, a.day, a.status) for a in Attendance.query.all()]
            return csv_response("attendance.csv", rows, ["id", "employee", "day", "status"])
        return ("Unknown export", 404)


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
