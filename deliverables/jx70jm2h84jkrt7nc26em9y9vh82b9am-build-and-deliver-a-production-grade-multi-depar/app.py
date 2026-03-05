import csv
import io
import math
import os
import sqlite3
from datetime import date, datetime, timedelta
from functools import wraps

from flask import (
    Flask,
    Response,
    abort,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
ROLE_ADMIN = "Admin"
ROLE_MANAGER = "Manager"
ROLE_REVIEWER = "Reviewer"
ALLOWED_ROLES = {ROLE_ADMIN, ROLE_MANAGER, ROLE_REVIEWER}


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "change-this-in-production"),
        DATABASE=os.environ.get("WORKFORCE_DB", os.path.join(app.instance_path, "workforce.db")),
        PER_PAGE=10,
    )

    if test_config:
        app.config.update(test_config)

    os.makedirs(app.instance_path, exist_ok=True)

    @app.teardown_appcontext
    def _close_db(exception):
        close_db()

    @app.before_request
    def _load_current_user():
        g.current_user = get_current_user()

    @app.context_processor
    def _inject_globals():
        unread = 0
        user = g.get("current_user")
        if user:
            db = get_db()
            unread = db.execute(
                """
                SELECT COUNT(*)
                FROM notifications
                WHERE is_read = 0 AND (user_id IS NULL OR user_id = ?)
                """,
                (user["id"],),
            ).fetchone()[0]
        return {
            "current_user": user,
            "unread_notifications": unread,
            "today": date.today().isoformat(),
        }

    with app.app_context():
        init_db()
        ensure_default_admin()

    @app.route("/")
    def index():
        if g.current_user:
            return redirect(url_for("dashboard"))
        return redirect(url_for("login"))

    @app.route("/health")
    def health():
        status = "ok"
        db_ok = True
        try:
            get_db().execute("SELECT 1").fetchone()
        except sqlite3.Error:
            db_ok = False
            status = "degraded"

        payload = {
            "status": status,
            "database": "ok" if db_ok else "error",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        return jsonify(payload), 200 if db_ok else 503

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if g.current_user:
            return redirect(url_for("dashboard"))

        if request.method == "POST":
            username = request.form.get("username", "").strip()
            password = request.form.get("password", "")

            user = get_db().execute(
                "SELECT * FROM users WHERE username = ? AND is_active = 1", (username,)
            ).fetchone()

            if user and check_password_hash(user["password_hash"], password):
                session.clear()
                session["user_id"] = user["id"]
                session["role"] = user["role"]
                session["username"] = user["username"]
                audit_log("LOGIN", "auth", user["id"], f"User {username} logged in")
                flash("Welcome back.", "success")
                return redirect(url_for("dashboard"))

            flash("Invalid username or password.", "error")

        return render_template("login.html")

    @app.route("/logout", methods=["POST", "GET"])
    @login_required
    def logout():
        user_id = session.get("user_id")
        username = session.get("username")
        session.clear()
        audit_log("LOGOUT", "auth", user_id, f"User {username} logged out")
        flash("You have been signed out.", "info")
        return redirect(url_for("login"))

    @app.route("/dashboard")
    @login_required
    def dashboard():
        db = get_db()
        today_str = date.today().isoformat()
        month_key = date.today().strftime("%Y-%m")
        week_end = (date.today() + timedelta(days=6)).isoformat()

        total_employees = db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
        active_employees = db.execute(
            "SELECT COUNT(*) FROM employees WHERE status = 'Active'"
        ).fetchone()[0]
        present_today = db.execute(
            """
            SELECT COUNT(*)
            FROM attendance
            WHERE attendance_date = ? AND status IN ('Present', 'Late')
            """,
            (today_str,),
        ).fetchone()[0]
        on_leave_today = db.execute(
            """
            SELECT COUNT(*)
            FROM leave_requests
            WHERE status = 'Approved'
              AND start_date <= ?
              AND end_date >= ?
            """,
            (today_str, today_str),
        ).fetchone()[0]
        pending_leave = db.execute(
            "SELECT COUNT(*) FROM leave_requests WHERE status = 'Pending'"
        ).fetchone()[0]
        planned_shifts = db.execute(
            """
            SELECT COUNT(*) FROM shifts
            WHERE shift_date BETWEEN ? AND ? AND status = 'Planned'
            """,
            (today_str, week_end),
        ).fetchone()[0]

        payroll_totals = _fetch_payroll_rows(month_key)
        month_payroll = round(sum(row[6] for row in payroll_totals), 2)

        recent_audits = db.execute(
            """
            SELECT created_at, actor_username, action, entity_type, entity_id, details
            FROM audit_logs
            ORDER BY created_at DESC
            LIMIT 12
            """
        ).fetchall()

        recent_notifications = db.execute(
            """
            SELECT id, message, level, is_read, created_at
            FROM notifications
            WHERE user_id IS NULL OR user_id = ?
            ORDER BY created_at DESC
            LIMIT 8
            """,
            (g.current_user["id"],),
        ).fetchall()

        kpis = {
            "total_employees": total_employees,
            "active_employees": active_employees,
            "present_today": present_today,
            "on_leave_today": on_leave_today,
            "pending_leave": pending_leave,
            "planned_shifts": planned_shifts,
            "month_payroll": month_payroll,
            "month_key": month_key,
        }

        return render_template(
            "dashboard.html",
            kpis=kpis,
            recent_audits=recent_audits,
            recent_notifications=recent_notifications,
        )

    @app.route("/employees")
    @login_required
    def employees_list():
        db = get_db()
        q = request.args.get("q", "").strip()
        department = request.args.get("department", "").strip()
        status = request.args.get("status", "").strip()
        page = clamp_int(request.args.get("page"), default=1, min_value=1)
        per_page = clamp_int(request.args.get("per_page"), default=10, min_value=1, max_value=100)

        where = []
        params = []
        if q:
            like = f"%{q}%"
            where.append("(full_name LIKE ? OR employee_code LIKE ? OR email LIKE ? OR title LIKE ?)")
            params.extend([like, like, like, like])
        if department:
            where.append("department = ?")
            params.append(department)
        if status:
            where.append("status = ?")
            params.append(status)

        where_clause = f" WHERE {' AND '.join(where)}" if where else ""
        total = db.execute(f"SELECT COUNT(*) FROM employees{where_clause}", params).fetchone()[0]
        page, pages, offset = paginate(total, page, per_page)

        rows = db.execute(
            f"""
            SELECT id, employee_code, full_name, email, department, title, status, hourly_rate, hire_date
            FROM employees
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [per_page, offset],
        ).fetchall()

        departments = db.execute(
            "SELECT DISTINCT department FROM employees ORDER BY department"
        ).fetchall()

        return render_template(
            "employees_list.html",
            employees=rows,
            departments=departments,
            page=page,
            pages=pages,
            total=total,
            per_page=per_page,
            filters={"q": q, "department": department, "status": status},
        )

    @app.route("/employees/new", methods=["GET", "POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER)
    def employee_new():
        if request.method == "POST":
            payload = _employee_payload_from_request()
            error = validate_employee_payload(payload)
            if error:
                flash(error, "error")
                return render_template("employee_form.html", mode="create", employee=payload)

            db = get_db()
            try:
                db.execute(
                    """
                    INSERT INTO employees
                    (employee_code, full_name, email, department, title, status, hourly_rate, hire_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["employee_code"],
                        payload["full_name"],
                        payload["email"],
                        payload["department"],
                        payload["title"],
                        payload["status"],
                        payload["hourly_rate"],
                        payload["hire_date"],
                    ),
                )
                db.commit()
            except sqlite3.IntegrityError:
                flash("Employee code or email already exists.", "error")
                return render_template("employee_form.html", mode="create", employee=payload)

            audit_log("CREATE", "employee", None, f"Created employee {payload['employee_code']}")
            create_notification(f"Employee {payload['full_name']} created.", level="success")
            flash("Employee created.", "success")
            return redirect(url_for("employees_list"))

        return render_template("employee_form.html", mode="create", employee={})

    @app.route("/employees/<int:employee_id>/edit", methods=["GET", "POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER)
    def employee_edit(employee_id):
        db = get_db()
        existing = db.execute("SELECT * FROM employees WHERE id = ?", (employee_id,)).fetchone()
        if not existing:
            abort(404)

        if request.method == "POST":
            payload = _employee_payload_from_request()
            error = validate_employee_payload(payload)
            if error:
                flash(error, "error")
                payload["id"] = employee_id
                return render_template("employee_form.html", mode="edit", employee=payload)
            try:
                db.execute(
                    """
                    UPDATE employees
                    SET employee_code = ?, full_name = ?, email = ?, department = ?, title = ?,
                        status = ?, hourly_rate = ?, hire_date = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (
                        payload["employee_code"],
                        payload["full_name"],
                        payload["email"],
                        payload["department"],
                        payload["title"],
                        payload["status"],
                        payload["hourly_rate"],
                        payload["hire_date"],
                        employee_id,
                    ),
                )
                db.commit()
            except sqlite3.IntegrityError:
                flash("Employee code or email already exists.", "error")
                payload["id"] = employee_id
                return render_template("employee_form.html", mode="edit", employee=payload)

            audit_log("UPDATE", "employee", employee_id, f"Updated employee {payload['employee_code']}")
            create_notification(f"Employee {payload['full_name']} updated.", level="info")
            flash("Employee updated.", "success")
            return redirect(url_for("employees_list"))

        return render_template("employee_form.html", mode="edit", employee=existing)

    @app.route("/employees/<int:employee_id>/delete", methods=["POST"])
    @login_required
    @roles_required(ROLE_ADMIN)
    def employee_delete(employee_id):
        db = get_db()
        employee = db.execute(
            "SELECT id, full_name, employee_code FROM employees WHERE id = ?", (employee_id,)
        ).fetchone()
        if not employee:
            abort(404)

        db.execute("DELETE FROM employees WHERE id = ?", (employee_id,))
        db.commit()

        audit_log("DELETE", "employee", employee_id, f"Deleted employee {employee['employee_code']}")
        create_notification(f"Employee {employee['full_name']} deleted.", level="warning")
        flash("Employee deleted.", "warning")
        return redirect(url_for("employees_list"))

    @app.route("/shifts")
    @login_required
    def shifts_list():
        db = get_db()
        q = request.args.get("q", "").strip()
        department = request.args.get("department", "").strip()
        status = request.args.get("status", "").strip()
        date_from = request.args.get("date_from", "").strip()
        date_to = request.args.get("date_to", "").strip()
        page = clamp_int(request.args.get("page"), default=1, min_value=1)
        per_page = clamp_int(request.args.get("per_page"), default=10, min_value=1, max_value=100)

        where = []
        params = []
        if q:
            like = f"%{q}%"
            where.append("(e.full_name LIKE ? OR e.employee_code LIKE ? OR s.location LIKE ?)")
            params.extend([like, like, like])
        if department:
            where.append("e.department = ?")
            params.append(department)
        if status:
            where.append("s.status = ?")
            params.append(status)
        if date_from:
            where.append("s.shift_date >= ?")
            params.append(date_from)
        if date_to:
            where.append("s.shift_date <= ?")
            params.append(date_to)

        where_clause = f" WHERE {' AND '.join(where)}" if where else ""

        total = db.execute(
            f"""
            SELECT COUNT(*)
            FROM shifts s
            JOIN employees e ON e.id = s.employee_id
            {where_clause}
            """,
            params,
        ).fetchone()[0]

        page, pages, offset = paginate(total, page, per_page)
        shifts = db.execute(
            f"""
            SELECT s.id, s.shift_date, s.start_time, s.end_time, s.location, s.status,
                   e.full_name AS employee_name, e.employee_code, e.department
            FROM shifts s
            JOIN employees e ON e.id = s.employee_id
            {where_clause}
            ORDER BY s.shift_date DESC, s.start_time DESC
            LIMIT ? OFFSET ?
            """,
            params + [per_page, offset],
        ).fetchall()

        departments = db.execute(
            "SELECT DISTINCT department FROM employees ORDER BY department"
        ).fetchall()

        return render_template(
            "shifts_list.html",
            shifts=shifts,
            departments=departments,
            page=page,
            pages=pages,
            total=total,
            per_page=per_page,
            filters={
                "q": q,
                "department": department,
                "status": status,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

    @app.route("/shifts/new", methods=["GET", "POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER)
    def shift_new():
        db = get_db()
        employees = db.execute(
            "SELECT id, employee_code, full_name, department FROM employees WHERE status != 'Inactive' ORDER BY full_name"
        ).fetchall()

        if request.method == "POST":
            employee_id = clamp_int(request.form.get("employee_id"), default=0, min_value=1)
            shift_date = request.form.get("shift_date", "").strip()
            start_time = request.form.get("start_time", "").strip()
            end_time = request.form.get("end_time", "").strip()
            location = request.form.get("location", "").strip()
            notes = request.form.get("notes", "").strip()
            status = request.form.get("status", "Planned").strip() or "Planned"

            if status not in {"Planned", "Completed", "Cancelled"}:
                status = "Planned"

            if not (employee_id and shift_date and start_time and end_time):
                flash("Employee, date, start time and end time are required.", "error")
                return render_template("shift_form.html", employees=employees, shift=request.form)

            db.execute(
                """
                INSERT INTO shifts
                (employee_id, shift_date, start_time, end_time, location, notes, status, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    employee_id,
                    shift_date,
                    start_time,
                    end_time,
                    location,
                    notes,
                    status,
                    g.current_user["id"],
                ),
            )
            db.commit()
            audit_log("CREATE", "shift", None, f"Shift created for employee_id={employee_id} on {shift_date}")
            create_notification(f"New shift scheduled for {shift_date}.", level="info")
            flash("Shift created.", "success")
            return redirect(url_for("shifts_list"))

        return render_template("shift_form.html", employees=employees, shift={})

    @app.route("/shifts/<int:shift_id>/delete", methods=["POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER)
    def shift_delete(shift_id):
        db = get_db()
        shift = db.execute("SELECT id, shift_date FROM shifts WHERE id = ?", (shift_id,)).fetchone()
        if not shift:
            abort(404)
        db.execute("DELETE FROM shifts WHERE id = ?", (shift_id,))
        db.commit()
        audit_log("DELETE", "shift", shift_id, f"Shift deleted for date={shift['shift_date']}")
        flash("Shift deleted.", "warning")
        return redirect(url_for("shifts_list"))

    @app.route("/attendance")
    @login_required
    def attendance_list():
        db = get_db()
        q = request.args.get("q", "").strip()
        department = request.args.get("department", "").strip()
        status = request.args.get("status", "").strip()
        date_from = request.args.get("date_from", "").strip()
        date_to = request.args.get("date_to", "").strip()
        page = clamp_int(request.args.get("page"), default=1, min_value=1)
        per_page = clamp_int(request.args.get("per_page"), default=10, min_value=1, max_value=100)

        where = []
        params = []
        if q:
            like = f"%{q}%"
            where.append("(e.full_name LIKE ? OR e.employee_code LIKE ?)")
            params.extend([like, like])
        if department:
            where.append("e.department = ?")
            params.append(department)
        if status:
            where.append("a.status = ?")
            params.append(status)
        if date_from:
            where.append("a.attendance_date >= ?")
            params.append(date_from)
        if date_to:
            where.append("a.attendance_date <= ?")
            params.append(date_to)

        where_clause = f" WHERE {' AND '.join(where)}" if where else ""

        total = db.execute(
            f"""
            SELECT COUNT(*)
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            {where_clause}
            """,
            params,
        ).fetchone()[0]

        page, pages, offset = paginate(total, page, per_page)
        rows = db.execute(
            f"""
            SELECT a.id, a.attendance_date, a.check_in, a.check_out, a.status, a.notes,
                   e.full_name AS employee_name, e.employee_code, e.department,
                   u.username AS approved_by_username
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            LEFT JOIN users u ON u.id = a.approved_by
            {where_clause}
            ORDER BY a.attendance_date DESC, e.full_name ASC
            LIMIT ? OFFSET ?
            """,
            params + [per_page, offset],
        ).fetchall()

        departments = db.execute(
            "SELECT DISTINCT department FROM employees ORDER BY department"
        ).fetchall()

        return render_template(
            "attendance_list.html",
            attendance=rows,
            departments=departments,
            page=page,
            pages=pages,
            total=total,
            per_page=per_page,
            filters={
                "q": q,
                "department": department,
                "status": status,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

    @app.route("/attendance/new", methods=["GET", "POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER)
    def attendance_new():
        db = get_db()
        employees = db.execute(
            "SELECT id, employee_code, full_name FROM employees WHERE status != 'Inactive' ORDER BY full_name"
        ).fetchall()

        if request.method == "POST":
            employee_id = clamp_int(request.form.get("employee_id"), default=0, min_value=1)
            attendance_date = request.form.get("attendance_date", "").strip()
            check_in_time = request.form.get("check_in_time", "").strip()
            check_out_time = request.form.get("check_out_time", "").strip()
            status = request.form.get("status", "Present").strip() or "Present"
            notes = request.form.get("notes", "").strip()

            if status not in {"Present", "Absent", "Late", "Leave"}:
                status = "Present"

            if not employee_id or not attendance_date:
                flash("Employee and date are required.", "error")
                return render_template("attendance_form.html", employees=employees, item=request.form)

            check_in = f"{attendance_date}T{check_in_time}:00" if check_in_time else None
            check_out = f"{attendance_date}T{check_out_time}:00" if check_out_time else None

            db.execute(
                """
                INSERT INTO attendance
                (employee_id, attendance_date, check_in, check_out, status, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(employee_id, attendance_date)
                DO UPDATE SET
                    check_in = excluded.check_in,
                    check_out = excluded.check_out,
                    status = excluded.status,
                    notes = excluded.notes,
                    created_by = excluded.created_by
                """,
                (
                    employee_id,
                    attendance_date,
                    check_in,
                    check_out,
                    status,
                    notes,
                    g.current_user["id"],
                ),
            )
            db.commit()

            audit_log(
                "UPSERT",
                "attendance",
                None,
                f"Attendance recorded for employee_id={employee_id} on {attendance_date}",
            )
            create_notification(f"Attendance updated for {attendance_date}.", level="info")
            flash("Attendance saved.", "success")
            return redirect(url_for("attendance_list"))

        return render_template(
            "attendance_form.html",
            employees=employees,
            item={"attendance_date": date.today().isoformat()},
        )

    @app.route("/attendance/<int:attendance_id>/approve", methods=["POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER, ROLE_REVIEWER)
    def attendance_approve(attendance_id):
        db = get_db()
        status = request.form.get("status", "").strip()
        row = db.execute(
            """
            SELECT a.id, a.status, a.attendance_date, e.full_name
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            WHERE a.id = ?
            """,
            (attendance_id,),
        ).fetchone()
        if not row:
            abort(404)

        update_status = row["status"]
        if status in {"Present", "Absent", "Late", "Leave"}:
            update_status = status

        db.execute(
            "UPDATE attendance SET approved_by = ?, status = ? WHERE id = ?",
            (g.current_user["id"], update_status, attendance_id),
        )
        db.commit()

        audit_log(
            "APPROVE",
            "attendance",
            attendance_id,
            f"Attendance approved for {row['full_name']} on {row['attendance_date']}",
        )
        create_notification(
            f"Attendance approved for {row['full_name']} ({row['attendance_date']}).",
            level="success",
        )
        flash("Attendance reviewed.", "success")
        return redirect(url_for("attendance_list"))

    @app.route("/leaves")
    @login_required
    def leave_list():
        db = get_db()
        q = request.args.get("q", "").strip()
        department = request.args.get("department", "").strip()
        status = request.args.get("status", "").strip()
        date_from = request.args.get("date_from", "").strip()
        date_to = request.args.get("date_to", "").strip()
        page = clamp_int(request.args.get("page"), default=1, min_value=1)
        per_page = clamp_int(request.args.get("per_page"), default=10, min_value=1, max_value=100)

        where = []
        params = []
        if q:
            like = f"%{q}%"
            where.append("(e.full_name LIKE ? OR e.employee_code LIKE ? OR l.reason LIKE ?)")
            params.extend([like, like, like])
        if department:
            where.append("e.department = ?")
            params.append(department)
        if status:
            where.append("l.status = ?")
            params.append(status)
        if date_from:
            where.append("l.start_date >= ?")
            params.append(date_from)
        if date_to:
            where.append("l.end_date <= ?")
            params.append(date_to)

        where_clause = f" WHERE {' AND '.join(where)}" if where else ""
        total = db.execute(
            f"""
            SELECT COUNT(*)
            FROM leave_requests l
            JOIN employees e ON e.id = l.employee_id
            {where_clause}
            """,
            params,
        ).fetchone()[0]

        page, pages, offset = paginate(total, page, per_page)

        leaves = db.execute(
            f"""
            SELECT l.id, l.leave_type, l.start_date, l.end_date, l.reason, l.status,
                   l.review_note, l.reviewed_at,
                   e.full_name AS employee_name, e.employee_code, e.department,
                   ru.username AS reviewer_username
            FROM leave_requests l
            JOIN employees e ON e.id = l.employee_id
            LEFT JOIN users ru ON ru.id = l.reviewed_by
            {where_clause}
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [per_page, offset],
        ).fetchall()

        departments = db.execute(
            "SELECT DISTINCT department FROM employees ORDER BY department"
        ).fetchall()

        return render_template(
            "leaves_list.html",
            leaves=leaves,
            departments=departments,
            page=page,
            pages=pages,
            total=total,
            per_page=per_page,
            filters={
                "q": q,
                "department": department,
                "status": status,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

    @app.route("/leaves/new", methods=["GET", "POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER)
    def leave_new():
        db = get_db()
        employees = db.execute(
            "SELECT id, employee_code, full_name FROM employees WHERE status != 'Inactive' ORDER BY full_name"
        ).fetchall()

        if request.method == "POST":
            employee_id = clamp_int(request.form.get("employee_id"), default=0, min_value=1)
            leave_type = request.form.get("leave_type", "Annual").strip() or "Annual"
            start_date = request.form.get("start_date", "").strip()
            end_date = request.form.get("end_date", "").strip()
            reason = request.form.get("reason", "").strip()

            if leave_type not in {"Annual", "Sick", "Unpaid", "Emergency"}:
                leave_type = "Annual"

            if not employee_id or not start_date or not end_date:
                flash("Employee, start date and end date are required.", "error")
                return render_template("leave_form.html", employees=employees, leave=request.form)

            if start_date > end_date:
                flash("Start date must be before or equal to end date.", "error")
                return render_template("leave_form.html", employees=employees, leave=request.form)

            db.execute(
                """
                INSERT INTO leave_requests
                (employee_id, leave_type, start_date, end_date, reason, status, requested_by)
                VALUES (?, ?, ?, ?, ?, 'Pending', ?)
                """,
                (employee_id, leave_type, start_date, end_date, reason, g.current_user["id"]),
            )
            db.commit()

            audit_log(
                "CREATE",
                "leave",
                None,
                f"Leave request created for employee_id={employee_id} from {start_date} to {end_date}",
            )
            create_notification(
                f"New leave request submitted ({start_date} to {end_date}).",
                level="warning",
            )
            flash("Leave request submitted.", "success")
            return redirect(url_for("leave_list"))

        return render_template(
            "leave_form.html",
            employees=employees,
            leave={"start_date": date.today().isoformat(), "end_date": date.today().isoformat()},
        )

    @app.route("/leaves/<int:leave_id>/review", methods=["POST"])
    @login_required
    @roles_required(ROLE_ADMIN, ROLE_MANAGER, ROLE_REVIEWER)
    def leave_review(leave_id):
        db = get_db()
        action = request.form.get("action", "").strip().lower()
        review_note = request.form.get("review_note", "").strip()
        leave = db.execute(
            """
            SELECT l.id, l.start_date, l.end_date, l.status, l.employee_id,
                   e.full_name AS employee_name
            FROM leave_requests l
            JOIN employees e ON e.id = l.employee_id
            WHERE l.id = ?
            """,
            (leave_id,),
        ).fetchone()
        if not leave:
            abort(404)

        new_status = "Approved" if action == "approve" else "Rejected"

        db.execute(
            """
            UPDATE leave_requests
            SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
            WHERE id = ?
            """,
            (new_status, g.current_user["id"], review_note, leave_id),
        )
        db.commit()

        audit_log(
            "REVIEW",
            "leave",
            leave_id,
            f"Leave {new_status.lower()} for {leave['employee_name']} ({leave['start_date']} to {leave['end_date']})",
        )
        create_notification(
            f"Leave {new_status.lower()} for {leave['employee_name']} ({leave['start_date']} to {leave['end_date']}).",
            level="success" if new_status == "Approved" else "error",
        )
        flash(f"Leave request {new_status.lower()}.", "success")
        return redirect(url_for("leave_list"))

    @app.route("/notifications")
    @login_required
    def notifications():
        db = get_db()
        scope = request.args.get("scope", "all").strip().lower()
        page = clamp_int(request.args.get("page"), default=1, min_value=1)
        per_page = clamp_int(request.args.get("per_page"), default=10, min_value=1, max_value=100)

        where = ["(user_id IS NULL OR user_id = ?)"]
        params = [g.current_user["id"]]
        if scope == "unread":
            where.append("is_read = 0")

        where_clause = " WHERE " + " AND ".join(where)
        total = db.execute(
            f"SELECT COUNT(*) FROM notifications {where_clause}", params
        ).fetchone()[0]
        page, pages, offset = paginate(total, page, per_page)

        rows = db.execute(
            f"""
            SELECT id, message, level, is_read, created_at
            FROM notifications
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [per_page, offset],
        ).fetchall()

        return render_template(
            "notifications.html",
            notifications=rows,
            page=page,
            pages=pages,
            total=total,
            per_page=per_page,
            scope=scope,
        )

    @app.route("/notifications/<int:notification_id>/read", methods=["POST"])
    @login_required
    def notification_mark_read(notification_id):
        db = get_db()
        db.execute(
            """
            UPDATE notifications
            SET is_read = 1
            WHERE id = ? AND (user_id IS NULL OR user_id = ?)
            """,
            (notification_id, g.current_user["id"]),
        )
        db.commit()
        return redirect(url_for("notifications"))

    @app.route("/notifications/read-all", methods=["POST"])
    @login_required
    def notification_mark_all_read():
        db = get_db()
        db.execute(
            """
            UPDATE notifications
            SET is_read = 1
            WHERE user_id IS NULL OR user_id = ?
            """,
            (g.current_user["id"],),
        )
        db.commit()
        flash("All notifications marked as read.", "success")
        return redirect(url_for("notifications"))

    @app.route("/audit")
    @login_required
    def audit_timeline():
        db = get_db()
        actor = request.args.get("actor", "").strip()
        action = request.args.get("action", "").strip()
        entity_type = request.args.get("entity_type", "").strip()
        date_from = request.args.get("date_from", "").strip()
        date_to = request.args.get("date_to", "").strip()
        page = clamp_int(request.args.get("page"), default=1, min_value=1)
        per_page = clamp_int(request.args.get("per_page"), default=15, min_value=1, max_value=100)

        where = []
        params = []
        if actor:
            where.append("actor_username LIKE ?")
            params.append(f"%{actor}%")
        if action:
            where.append("action = ?")
            params.append(action)
        if entity_type:
            where.append("entity_type = ?")
            params.append(entity_type)
        if date_from:
            where.append("date(created_at) >= ?")
            params.append(date_from)
        if date_to:
            where.append("date(created_at) <= ?")
            params.append(date_to)

        where_clause = f" WHERE {' AND '.join(where)}" if where else ""
        total = db.execute(
            f"SELECT COUNT(*) FROM audit_logs {where_clause}", params
        ).fetchone()[0]
        page, pages, offset = paginate(total, page, per_page)

        logs = db.execute(
            f"""
            SELECT id, created_at, actor_username, action, entity_type, entity_id, details
            FROM audit_logs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [per_page, offset],
        ).fetchall()

        return render_template(
            "audit.html",
            logs=logs,
            page=page,
            pages=pages,
            total=total,
            per_page=per_page,
            filters={
                "actor": actor,
                "action": action,
                "entity_type": entity_type,
                "date_from": date_from,
                "date_to": date_to,
            },
        )

    @app.route("/exports/<string:entity>.<string:file_format>")
    @login_required
    def export_data(entity, file_format):
        entity = entity.lower().strip()
        file_format = file_format.lower().strip()

        if file_format not in {"csv", "pdf"}:
            abort(404)

        month = request.args.get("month", date.today().strftime("%Y-%m")).strip()
        headers, rows = get_export_rows(entity, month)

        if headers is None:
            abort(404)

        stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"{entity}_{stamp}.{file_format}"

        if file_format == "csv":
            body = to_csv(headers, rows)
            resp = Response(body, mimetype="text/csv")
        else:
            lines = [" | ".join(headers)] + [" | ".join(map(str, row)) for row in rows]
            body = build_basic_pdf(lines)
            resp = Response(body, mimetype="application/pdf")

        resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'

        audit_log(
            "EXPORT",
            entity,
            None,
            f"Exported {entity} as {file_format} ({len(rows)} records)",
        )
        return resp

    @app.errorhandler(403)
    def forbidden(_err):
        return render_template("error.html", title="403 Forbidden", message="Access denied."), 403

    @app.errorhandler(404)
    def not_found(_err):
        return render_template("error.html", title="404 Not Found", message="Resource not found."), 404

    def get_export_rows(entity, month_key):
        db = get_db()
        if entity == "employees":
            rows = db.execute(
                """
                SELECT employee_code, full_name, email, department, title, status, hourly_rate, hire_date
                FROM employees
                ORDER BY full_name
                """
            ).fetchall()
            return [
                "employee_code",
                "full_name",
                "email",
                "department",
                "title",
                "status",
                "hourly_rate",
                "hire_date",
            ], [list(row) for row in rows]

        if entity == "shifts":
            rows = db.execute(
                """
                SELECT e.employee_code, e.full_name, s.shift_date, s.start_time, s.end_time, s.location, s.status
                FROM shifts s
                JOIN employees e ON e.id = s.employee_id
                ORDER BY s.shift_date DESC
                """
            ).fetchall()
            return [
                "employee_code",
                "employee_name",
                "shift_date",
                "start_time",
                "end_time",
                "location",
                "status",
            ], [list(row) for row in rows]

        if entity == "attendance":
            rows = db.execute(
                """
                SELECT e.employee_code, e.full_name, a.attendance_date, a.check_in, a.check_out, a.status, a.notes
                FROM attendance a
                JOIN employees e ON e.id = a.employee_id
                ORDER BY a.attendance_date DESC
                """
            ).fetchall()
            return [
                "employee_code",
                "employee_name",
                "attendance_date",
                "check_in",
                "check_out",
                "status",
                "notes",
            ], [list(row) for row in rows]

        if entity == "leaves":
            rows = db.execute(
                """
                SELECT e.employee_code, e.full_name, l.leave_type, l.start_date, l.end_date, l.status, l.review_note
                FROM leave_requests l
                JOIN employees e ON e.id = l.employee_id
                ORDER BY l.created_at DESC
                """
            ).fetchall()
            return [
                "employee_code",
                "employee_name",
                "leave_type",
                "start_date",
                "end_date",
                "status",
                "review_note",
            ], [list(row) for row in rows]

        if entity == "payroll":
            rows = _fetch_payroll_rows(month_key)
            return [
                "employee_code",
                "employee_name",
                "department",
                "hourly_rate",
                "hours_worked",
                "overtime_hours",
                "gross_pay",
                "period",
            ], rows

        return None, None

    return app


def get_db():
    if "db" not in g:
        db = sqlite3.connect(current_app.config["DATABASE"])
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


def close_db():
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    schema_path = os.path.join(BASE_DIR, "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as file_obj:
        db.executescript(file_obj.read())
    db.commit()


def ensure_default_admin():
    db = get_db()
    count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count:
        return

    username = os.environ.get("DEFAULT_ADMIN_USERNAME", "admin")
    password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin123")
    full_name = os.environ.get("DEFAULT_ADMIN_FULLNAME", "System Admin")

    db.execute(
        """
        INSERT INTO users (username, password_hash, role, full_name)
        VALUES (?, ?, ?, ?)
        """,
        (
            username,
            generate_password_hash(password, method="pbkdf2:sha256"),
            ROLE_ADMIN,
            full_name,
        ),
    )
    db.commit()


def get_current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None

    row = get_db().execute(
        "SELECT id, username, role, full_name FROM users WHERE id = ? AND is_active = 1",
        (user_id,),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not g.get("current_user"):
            flash("Please log in first.", "warning")
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def roles_required(*allowed_roles):
    allowed = set(allowed_roles)

    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = g.get("current_user")
            if not user:
                return redirect(url_for("login"))
            if user["role"] not in allowed:
                abort(403)
            return view(*args, **kwargs)

        return wrapped

    return decorator


def audit_log(action, entity_type, entity_id=None, details=""):
    user = g.get("current_user")
    actor_user_id = user["id"] if user else None
    actor_username = user["username"] if user else "system"

    db = get_db()
    db.execute(
        """
        INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (actor_user_id, actor_username, action, entity_type, entity_id, details),
    )
    db.commit()


def create_notification(message, level="info", user_id=None):
    if level not in {"info", "success", "warning", "error"}:
        level = "info"

    db = get_db()
    db.execute(
        "INSERT INTO notifications (user_id, message, level) VALUES (?, ?, ?)",
        (user_id, message, level),
    )
    db.commit()


def clamp_int(raw_value, default=1, min_value=None, max_value=None):
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = default

    if min_value is not None:
        value = max(min_value, value)
    if max_value is not None:
        value = min(max_value, value)
    return value


def paginate(total, page, per_page):
    pages = max(1, math.ceil(total / per_page)) if total else 1
    page = max(1, min(page, pages))
    offset = (page - 1) * per_page
    return page, pages, offset


def parse_iso_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def calculate_work_hours(check_in, check_out):
    start = parse_iso_datetime(check_in)
    end = parse_iso_datetime(check_out)
    if not start or not end or end <= start:
        return 0.0
    return round((end - start).total_seconds() / 3600, 2)


def validate_employee_payload(payload):
    required = ["employee_code", "full_name", "email", "department", "title", "hire_date"]
    for field in required:
        if not payload.get(field):
            return f"{field.replace('_', ' ').title()} is required."

    if payload.get("status") not in {"Active", "Inactive", "On Leave"}:
        return "Invalid employee status."
    if payload.get("hourly_rate", 0) < 0:
        return "Hourly rate must be non-negative."
    return None


def _employee_payload_from_request():
    hourly_rate_raw = (request.form.get("hourly_rate", "0") or "0").strip()
    try:
        hourly_rate = round(float(hourly_rate_raw), 2)
    except ValueError:
        hourly_rate = -1.0

    return {
        "employee_code": request.form.get("employee_code", "").strip(),
        "full_name": request.form.get("full_name", "").strip(),
        "email": request.form.get("email", "").strip(),
        "department": request.form.get("department", "").strip(),
        "title": request.form.get("title", "").strip(),
        "status": request.form.get("status", "Active").strip() or "Active",
        "hourly_rate": hourly_rate,
        "hire_date": request.form.get("hire_date", "").strip(),
    }


def to_csv(headers, rows):
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return stream.getvalue()


def build_basic_pdf(lines):
    def escape_pdf_text(text):
        text = str(text)
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    text_lines = [line[:140] for line in lines[:52]]
    content_parts = ["BT", "/F1 10 Tf", "50 760 Td"]

    for index, line in enumerate(text_lines):
        if index:
            content_parts.append("0 -14 Td")
        content_parts.append(f"({escape_pdf_text(line)}) Tj")
    content_parts.append("ET")

    stream_content = "\n".join(content_parts).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
        ),
        (
            f"<< /Length {len(stream_content)} >>\nstream\n".encode("ascii")
            + stream_content
            + b"\nendstream"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    pdf = b"%PDF-1.4\n"
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode("ascii")
        pdf += obj + b"\nendobj\n"

    xref_start = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        pdf += f"{off:010d} 00000 n \n".encode("ascii")

    pdf += (
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_start}\n%%EOF"
    ).encode("ascii")
    return pdf


def _fetch_payroll_rows(month_key):
    db = get_db()
    sql = """
        SELECT
            e.employee_code,
            e.full_name,
            e.department,
            e.hourly_rate,
            COALESCE(
                SUM(
                    CASE
                        WHEN a.status IN ('Present', 'Late') AND a.check_in IS NOT NULL AND a.check_out IS NOT NULL
                        THEN (julianday(a.check_out) - julianday(a.check_in)) * 24
                        ELSE 0
                    END
                ),
                0
            ) AS total_hours
        FROM employees e
        LEFT JOIN attendance a
            ON a.employee_id = e.id
           AND substr(a.attendance_date, 1, 7) = ?
        WHERE e.status != 'Inactive'
        GROUP BY e.id
        ORDER BY e.full_name
    """
    result = db.execute(sql, (month_key,)).fetchall()

    rows = []
    for row in result:
        hours = round(float(row[4]), 2)
        overtime = round(max(0.0, hours - 160), 2)
        gross = round(hours * float(row[3]), 2)
        rows.append(
            [
                row[0],
                row[1],
                row[2],
                round(float(row[3]), 2),
                hours,
                overtime,
                gross,
                month_key,
            ]
        )
    return rows


app = create_app()


if __name__ == "__main__":
    host = os.environ.get("FLASK_RUN_HOST", "0.0.0.0")
    port = clamp_int(os.environ.get("FLASK_RUN_PORT"), default=5000, min_value=1, max_value=65535)
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
