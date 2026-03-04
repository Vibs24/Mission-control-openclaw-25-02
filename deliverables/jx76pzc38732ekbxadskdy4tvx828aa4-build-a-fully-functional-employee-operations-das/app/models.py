from datetime import date, datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from . import db, login_manager


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    entity_type = db.Column(db.String(30), nullable=False)
    entity_id = db.Column(db.Integer, nullable=True)
    action = db.Column(db.String(30), nullable=False)
    message = db.Column(db.String(255), nullable=False)
    actor = db.Column(db.String(80), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


class Department(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    employees = db.relationship("Employee", backref="department", lazy=True)


class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_code = db.Column(db.String(30), unique=True, nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    role = db.Column(db.String(80), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="Active")
    joining_date = db.Column(db.Date, nullable=False, default=date.today)
    department_id = db.Column(db.Integer, db.ForeignKey("department.id"), nullable=False)
    tasks = db.relationship("Task", backref="employee", lazy=True)
    attendance = db.relationship("Attendance", backref="employee", lazy=True)
    leaves = db.relationship("Leave", backref="employee", lazy=True)


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    priority = db.Column(db.String(20), nullable=False, default="Medium")
    status = db.Column(db.String(20), nullable=False, default="Open")
    due_date = db.Column(db.Date, nullable=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)


class Attendance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    day = db.Column(db.Date, nullable=False, default=date.today)
    status = db.Column(db.String(20), nullable=False, default="Present")
    check_in = db.Column(db.String(10), nullable=True)
    check_out = db.Column(db.String(10), nullable=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)


class Leave(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    leave_type = db.Column(db.String(30), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Pending")
    reason = db.Column(db.String(255), nullable=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employee.id"), nullable=False)
