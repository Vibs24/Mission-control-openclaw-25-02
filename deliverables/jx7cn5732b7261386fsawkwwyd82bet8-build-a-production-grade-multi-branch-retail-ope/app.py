import csv
import io
import os
import random
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask,
    Response,
    abort,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False


ROLES = {"staff": 1, "manager": 2, "admin": 3}
DEFAULT_USERS = [
    ("admin", "admin123", "admin", None),
    ("manager_central", "manager123", "manager", "Central"),
    ("staff_central", "staff123", "staff", "Central"),
    ("manager_north", "manager123", "manager", "North"),
    ("staff_north", "staff123", "staff", "North"),
    ("manager_south", "manager123", "manager", "South"),
    ("staff_south", "staff123", "staff", "South"),
]


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", "change-me-in-production"),
        DATABASE=os.path.join(app.root_path, "retail.db"),
        PAGE_SIZE=10,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        FORCE_PDF_FALLBACK=False,
    )
    if test_config:
        app.config.update(test_config)

    def get_db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"])
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    def close_db(_=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    app.teardown_appcontext(close_db)

    def init_db():
        with closing(app.open_resource("schema.sql")) as schema_file:
            get_db().executescript(schema_file.read().decode("utf-8"))
        get_db().commit()

    def parse_page() -> int:
        raw = request.args.get("page", "1")
        try:
            page = int(raw)
        except ValueError:
            page = 1
        return max(page, 1)

    def build_where(conditions):
        return f" WHERE {' AND '.join(conditions)}" if conditions else ""

    def branch_scope(alias=""):
        if session.get("role") == "admin":
            return [], []
        prefix = f"{alias}." if alias else ""
        return [f"{prefix}branch_id = ?"], [session.get("branch_id")]

    def ensure_branch_allowed(branch_id: int) -> bool:
        return session.get("role") == "admin" or branch_id == session.get("branch_id")

    def paginate(base_query, params=()):
        page = parse_page()
        size = int(app.config.get("PAGE_SIZE", 10))
        total = get_db().execute(
            f"SELECT COUNT(*) AS c FROM ({base_query}) AS scoped", tuple(params)
        ).fetchone()["c"]
        pages = max((total + size - 1) // size, 1)
        if page > pages:
            page = pages
        rows = get_db().execute(
            f"{base_query} LIMIT ? OFFSET ?",
            tuple(params) + (size, (page - 1) * size),
        ).fetchall()
        return rows, page, pages, total

    def log_action(action, entity, entity_id=None, details="", user_id=None, commit=True):
        db = get_db()
        actor_id = user_id if user_id is not None else session.get("user_id")
        db.execute(
            "INSERT INTO audit_logs(user_id, action, entity, entity_id, details) VALUES(?,?,?,?,?)",
            (actor_id, action, entity, entity_id, details),
        )
        if commit:
            db.commit()

    def create_notification(level, message, commit=True):
        db = get_db()
        db.execute(
            "INSERT INTO notifications(level, message) VALUES(?, ?)",
            (level, message),
        )
        if commit:
            db.commit()

    def detect_low_stock_notifications(commit=True):
        db = get_db()
        rows = db.execute(
            """
            SELECT p.name AS product_name, b.name AS branch_name, i.qty, i.reorder_level
            FROM inventory i
            JOIN products p ON p.id = i.product_id
            JOIN branches b ON b.id = p.branch_id
            WHERE i.qty <= i.reorder_level
            """
        ).fetchall()
        for row in rows:
            message = (
                f"Low stock: {row['product_name']} at {row['branch_name']} "
                f"({row['qty']}/{row['reorder_level']})"
            )
            exists = db.execute(
                """
                SELECT 1 FROM notifications
                WHERE message = ? AND is_read = 0
                LIMIT 1
                """,
                (message,),
            ).fetchone()
            if not exists:
                db.execute(
                    "INSERT INTO notifications(level, message) VALUES(?, ?)",
                    ("warning", message),
                )
        if commit:
            db.commit()

    def role_required(min_role="staff"):
        def decorator(view_func):
            @wraps(view_func)
            def wrapped(*args, **kwargs):
                if not session.get("user_id"):
                    flash("Please login to continue.", "error")
                    return redirect(url_for("login", next=request.path))
                if ROLES.get(session.get("role", "staff"), 0) < ROLES[min_role]:
                    flash("Insufficient permission for this action.", "error")
                    return redirect(url_for("dashboard"))
                return view_func(*args, **kwargs)

            return wrapped

        return decorator

    def reportlab_enabled() -> bool:
        return REPORTLAB_AVAILABLE and not app.config.get("FORCE_PDF_FALLBACK", False)

    def text_to_minimal_pdf(text: str) -> bytes:
        lines = text.splitlines() or [""]
        y_start = 800
        stream_parts = ["BT", "/F1 10 Tf", f"40 {y_start} Td"]
        first = True
        for line in lines:
            escaped = (
                line.replace("\\", "\\\\")
                .replace("(", "\\(")
                .replace(")", "\\)")
            )
            if first:
                stream_parts.append(f"({escaped}) Tj")
                first = False
            else:
                stream_parts.append("0 -14 Td")
                stream_parts.append(f"({escaped}) Tj")
        stream_parts.append("ET")
        stream = "\n".join(stream_parts).encode("utf-8")

        objects = [
            b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
            b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
            (
                b"5 0 obj\n<< /Length "
                + str(len(stream)).encode("utf-8")
                + b" >>\nstream\n"
                + stream
                + b"\nendstream\nendobj\n"
            ),
        ]

        content = b"%PDF-1.4\n"
        offsets = [0]
        for obj in objects:
            offsets.append(len(content))
            content += obj
        xref_start = len(content)
        content += b"xref\n0 6\n"
        content += b"0000000000 65535 f \n"
        for offset in offsets[1:]:
            content += f"{offset:010d} 00000 n \n".encode("utf-8")
        content += (
            b"trailer\n<< /Size 6 /Root 1 0 R >>\n"
            + b"startxref\n"
            + str(xref_start).encode("utf-8")
            + b"\n%%EOF"
        )
        return content

    def table_pdf_bytes(title: str, rows):
        headers = list(rows[0].keys()) if rows else []
        if reportlab_enabled():
            buffer = io.BytesIO()
            pdf = canvas.Canvas(buffer, pagesize=A4)
            width, height = A4
            y = height - 50
            pdf.setFont("Helvetica-Bold", 14)
            pdf.drawString(40, y, title)
            y -= 24

            if headers:
                pdf.setFont("Helvetica-Bold", 9)
                pdf.drawString(40, y, " | ".join(headers)[:130])
                y -= 14
                pdf.setFont("Helvetica", 9)

            for row in rows:
                line = " | ".join(str(row[h]) for h in headers)[:130]
                pdf.drawString(40, y, line)
                y -= 12
                if y < 60:
                    pdf.showPage()
                    y = height - 50
                    pdf.setFont("Helvetica", 9)

            if not rows:
                pdf.setFont("Helvetica", 10)
                pdf.drawString(40, y, "No records available")

            pdf.save()
            buffer.seek(0)
            return buffer.getvalue()

        lines = [title, "", " | ".join(headers) if headers else "No records available"]
        for row in rows:
            lines.append(" | ".join(str(row[h]) for h in headers))
        return text_to_minimal_pdf("\n".join(lines))

    def invoice_pdf_bytes(sale, items):
        if reportlab_enabled():
            buffer = io.BytesIO()
            pdf = canvas.Canvas(buffer, pagesize=A4)
            width, height = A4
            y = height - 50
            pdf.setFont("Helvetica-Bold", 16)
            pdf.drawString(40, y, f"Invoice #{sale['id']}")
            y -= 20
            pdf.setFont("Helvetica", 10)
            pdf.drawString(40, y, f"Date: {sale['created_at']}")
            y -= 15
            pdf.drawString(40, y, f"Branch: {sale['branch_name']}")
            y -= 15
            pdf.drawString(40, y, f"Customer: {sale['customer_name'] or 'Walk-in'}")
            y -= 24
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawString(40, y, "Product")
            pdf.drawString(300, y, "Qty")
            pdf.drawString(360, y, "Unit")
            pdf.drawString(440, y, "Line Total")
            y -= 14
            pdf.setFont("Helvetica", 10)

            for item in items:
                line_total = item["qty"] * item["unit_price"]
                pdf.drawString(40, y, str(item["product_name"])[:40])
                pdf.drawString(300, y, str(item["qty"]))
                pdf.drawString(360, y, f"{item['unit_price']:.2f}")
                pdf.drawString(440, y, f"{line_total:.2f}")
                y -= 14
                if y < 80:
                    pdf.showPage()
                    y = height - 50
                    pdf.setFont("Helvetica", 10)

            y -= 10
            pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(40, y, f"Total: {sale['total']:.2f}")
            y -= 15
            pdf.drawString(40, y, f"Margin: {sale['margin']:.2f}")
            pdf.save()
            buffer.seek(0)
            return buffer.getvalue()

        lines = [
            f"Invoice #{sale['id']}",
            f"Date: {sale['created_at']}",
            f"Branch: {sale['branch_name']}",
            f"Customer: {sale['customer_name'] or 'Walk-in'}",
            "",
            "Product | Qty | Unit | Line Total",
        ]
        for item in items:
            lines.append(
                f"{item['product_name']} | {item['qty']} | {item['unit_price']:.2f} | {(item['qty'] * item['unit_price']):.2f}"
            )
        lines.append("")
        lines.append(f"Total: {sale['total']:.2f}")
        lines.append(f"Margin: {sale['margin']:.2f}")
        return text_to_minimal_pdf("\n".join(lines))

    def fetch_sale(sale_id):
        conditions = ["s.id = ?"]
        params = [sale_id]
        scope_conditions, scope_params = branch_scope("s")
        conditions.extend(scope_conditions)
        params.extend(scope_params)
        query = (
            "SELECT s.*, b.name AS branch_name, c.name AS customer_name, u.username AS created_by_name "
            "FROM sales s "
            "JOIN branches b ON b.id = s.branch_id "
            "LEFT JOIN customers c ON c.id = s.customer_id "
            "LEFT JOIN users u ON u.id = s.created_by"
            f"{build_where(conditions)}"
        )
        return get_db().execute(query, tuple(params)).fetchone()

    @app.cli.command("init-db")
    def init_db_command():
        init_db()
        print("Database initialized")

    @app.context_processor
    def inject_context():
        return {
            "now": datetime.utcnow,
            "role_rank": ROLES,
            "reportlab_enabled": reportlab_enabled(),
        }

    @app.route("/")
    def index():
        if session.get("user_id"):
            return redirect(url_for("dashboard"))
        return redirect(url_for("login"))

    @app.route("/health")
    def health():
        return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if session.get("user_id"):
            return redirect(url_for("dashboard"))

        if request.method == "POST":
            username = request.form.get("username", "").strip()
            password = request.form.get("password", "")
            user = get_db().execute(
                """
                SELECT u.*, b.name AS branch_name
                FROM users u
                LEFT JOIN branches b ON b.id = u.branch_id
                WHERE u.username = ?
                """,
                (username,),
            ).fetchone()

            if user and check_password_hash(user["password"], password):
                session.clear()
                session.update(
                    {
                        "user_id": user["id"],
                        "username": user["username"],
                        "role": user["role"],
                        "branch_id": user["branch_id"],
                        "branch_name": user["branch_name"] or "All Branches",
                    }
                )
                log_action(
                    "login",
                    "auth",
                    user["id"],
                    f"{user['username']} logged in",
                    user_id=user["id"],
                    commit=True,
                )
                detect_low_stock_notifications(commit=True)
                next_url = request.args.get("next")
                if next_url and next_url.startswith("/"):
                    return redirect(next_url)
                return redirect(url_for("dashboard"))

            flash("Invalid credentials", "error")

        return render_template("login.html", default_users=DEFAULT_USERS)

    @app.route("/logout", methods=["POST"])
    @role_required("staff")
    def logout():
        log_action("logout", "auth", session.get("user_id"), "User logged out", commit=True)
        session.clear()
        flash("Logged out.", "info")
        return redirect(url_for("login"))

    @app.route("/dashboard")
    @role_required("staff")
    def dashboard():
        db = get_db()
        sales_conditions = ["date(s.created_at) = date('now')"]
        sales_params = []
        scope_conditions, scope_params = branch_scope("s")
        sales_conditions.extend(scope_conditions)
        sales_params.extend(scope_params)

        sales_today = db.execute(
            f"SELECT COALESCE(SUM(s.total), 0) AS v FROM sales s{build_where(sales_conditions)}",
            tuple(sales_params),
        ).fetchone()["v"]

        margin_today = db.execute(
            f"SELECT COALESCE(SUM(s.margin), 0) AS v FROM sales s{build_where(sales_conditions)}",
            tuple(sales_params),
        ).fetchone()["v"]

        cogs_conditions, cogs_params = branch_scope("s")
        cogs = db.execute(
            "SELECT COALESCE(SUM(si.qty * si.unit_cost), 0) AS v "
            "FROM sales_items si JOIN sales s ON s.id = si.sale_id"
            f"{build_where(cogs_conditions)}",
            tuple(cogs_params),
        ).fetchone()["v"]

        inv_conditions, inv_params = branch_scope("p")
        avg_inventory = db.execute(
            "SELECT COALESCE(AVG(i.qty * p.cost_price), 0) AS v "
            "FROM inventory i JOIN products p ON p.id = i.product_id"
            f"{build_where(inv_conditions)}",
            tuple(inv_params),
        ).fetchone()["v"]
        stock_turnover = round(cogs / avg_inventory, 2) if avg_inventory else 0

        low_conditions, low_params = branch_scope("p")
        low_stock_rows = db.execute(
            """
            SELECT p.name AS product_name, b.name AS branch_name, i.qty, i.reorder_level
            FROM inventory i
            JOIN products p ON p.id = i.product_id
            JOIN branches b ON b.id = p.branch_id
            """
            f"{build_where(low_conditions + ['i.qty <= i.reorder_level'])} "
            "ORDER BY i.qty ASC, p.name ASC LIMIT 8",
            tuple(low_params),
        ).fetchall()

        unread_notifications = db.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0"
        ).fetchone()["c"]

        return render_template(
            "dashboard.html",
            sales_today=round(sales_today, 2),
            margin_today=round(margin_today, 2),
            stock_turnover=stock_turnover,
            low_stock_rows=low_stock_rows,
            unread_notifications=unread_notifications,
        )

    @app.route("/branches", methods=["GET", "POST"])
    @role_required("manager")
    def branches():
        db = get_db()
        if request.method == "POST":
            if session.get("role") != "admin":
                flash("Only admins can create branches.", "error")
                return redirect(url_for("branches"))

            name = request.form.get("name", "").strip()
            location = request.form.get("location", "").strip()
            if not name or not location:
                flash("Branch name and location are required.", "error")
                return redirect(url_for("branches"))

            try:
                cur = db.execute(
                    "INSERT INTO branches(name, location) VALUES(?, ?)",
                    (name, location),
                )
                db.commit()
                log_action("create", "branch", cur.lastrowid, f"{name} @ {location}")
                create_notification("info", f"Branch created: {name} ({location})")
                flash("Branch created.", "success")
            except sqlite3.IntegrityError:
                flash("Branch name must be unique.", "error")
            return redirect(url_for("branches"))

        q = request.args.get("q", "").strip()
        conditions = []
        params = []
        if q:
            conditions.append("(b.name LIKE ? OR b.location LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%"])

        base = (
            "SELECT b.id, b.name, b.location, "
            "COUNT(DISTINCT p.id) AS product_count, "
            "COUNT(DISTINCT u.id) AS user_count "
            "FROM branches b "
            "LEFT JOIN products p ON p.branch_id = b.id "
            "LEFT JOIN users u ON u.branch_id = b.id "
            f"{build_where(conditions)} "
            "GROUP BY b.id "
            "ORDER BY b.id DESC"
        )
        rows, page, pages, total = paginate(base, params)
        return render_template(
            "branches.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
            can_create=session.get("role") == "admin",
        )

    @app.route("/inventory", methods=["GET", "POST"])
    @role_required("staff")
    def inventory():
        db = get_db()

        if request.method == "POST":
            if ROLES[session.get("role", "staff")] < ROLES["manager"]:
                flash("Only managers/admins can add inventory products.", "error")
                return redirect(url_for("inventory"))

            sku = request.form.get("sku", "").strip()
            name = request.form.get("name", "").strip()
            category = request.form.get("category", "").strip()
            try:
                cost_price = float(request.form.get("cost_price", 0))
                sell_price = float(request.form.get("sell_price", 0))
                qty = int(request.form.get("qty", 0))
                reorder_level = int(request.form.get("reorder_level", 10))
            except ValueError:
                flash("Numeric fields contain invalid values.", "error")
                return redirect(url_for("inventory"))

            branch_id = request.form.get("branch_id")
            if session.get("role") != "admin":
                branch_id = session.get("branch_id")
            if not branch_id:
                flash("Branch is required.", "error")
                return redirect(url_for("inventory"))

            if not sku or not name or cost_price <= 0 or sell_price <= 0 or qty < 0:
                flash("Provide valid product details.", "error")
                return redirect(url_for("inventory"))

            try:
                cur = db.execute(
                    """
                    INSERT INTO products(sku, name, category, cost_price, sell_price, branch_id)
                    VALUES(?,?,?,?,?,?)
                    """,
                    (sku, name, category, cost_price, sell_price, int(branch_id)),
                )
                product_id = cur.lastrowid
                db.execute(
                    "INSERT INTO inventory(product_id, qty, reorder_level) VALUES(?,?,?)",
                    (product_id, qty, reorder_level),
                )
                db.commit()
                log_action("create", "inventory", product_id, f"{sku} qty={qty}")
                flash("Product and inventory record created.", "success")
                detect_low_stock_notifications(commit=True)
            except sqlite3.IntegrityError:
                flash("SKU already exists.", "error")

            return redirect(url_for("inventory"))

        q = request.args.get("q", "").strip()
        low_only = request.args.get("low") == "1"
        branch_filter = request.args.get("branch_id", "").strip()

        conditions, params = branch_scope("p")

        if q:
            conditions.append("(p.sku LIKE ? OR p.name LIKE ? OR p.category LIKE ? OR b.name LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])

        if low_only:
            conditions.append("i.qty <= i.reorder_level")

        if session.get("role") == "admin" and branch_filter:
            conditions.append("p.branch_id = ?")
            params.append(int(branch_filter))

        base = (
            "SELECT p.id, p.sku, p.name, p.category, p.cost_price, p.sell_price, "
            "p.branch_id, b.name AS branch_name, i.qty, i.reorder_level "
            "FROM products p "
            "JOIN branches b ON b.id = p.branch_id "
            "JOIN inventory i ON i.product_id = p.id "
            f"{build_where(conditions)} "
            "ORDER BY p.id DESC"
        )
        rows, page, pages, total = paginate(base, params)
        branches_rows = db.execute("SELECT id, name FROM branches ORDER BY name").fetchall()

        return render_template(
            "inventory.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
            low_only=low_only,
            branches=branches_rows,
            branch_filter=branch_filter,
            can_create=ROLES[session.get("role", "staff")] >= ROLES["manager"],
        )

    @app.route("/vendors", methods=["GET", "POST"])
    @role_required("manager")
    def vendors():
        db = get_db()

        if request.method == "POST":
            name = request.form.get("name", "").strip()
            contact = request.form.get("contact", "").strip()
            branch_id = request.form.get("branch_id")
            if session.get("role") != "admin":
                branch_id = session.get("branch_id")
            if not name or not branch_id:
                flash("Vendor name and branch are required.", "error")
                return redirect(url_for("vendors"))

            cur = db.execute(
                "INSERT INTO vendors(name, contact, branch_id) VALUES(?,?,?)",
                (name, contact, int(branch_id)),
            )
            db.commit()
            log_action("create", "vendor", cur.lastrowid, f"{name}")
            flash("Vendor created.", "success")
            return redirect(url_for("vendors"))

        q = request.args.get("q", "").strip()
        branch_filter = request.args.get("branch_id", "").strip()
        conditions, params = branch_scope("v")
        if q:
            conditions.append("(v.name LIKE ? OR v.contact LIKE ? OR b.name LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
        if session.get("role") == "admin" and branch_filter:
            conditions.append("v.branch_id = ?")
            params.append(int(branch_filter))

        base = (
            "SELECT v.id, v.name, v.contact, v.branch_id, b.name AS branch_name "
            "FROM vendors v JOIN branches b ON b.id = v.branch_id "
            f"{build_where(conditions)} ORDER BY v.id DESC"
        )
        rows, page, pages, total = paginate(base, params)
        branches_rows = db.execute("SELECT id, name FROM branches ORDER BY name").fetchall()
        return render_template(
            "vendors.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
            branches=branches_rows,
            branch_filter=branch_filter,
        )

    @app.route("/customers", methods=["GET", "POST"])
    @role_required("staff")
    def customers():
        db = get_db()

        if request.method == "POST":
            name = request.form.get("name", "").strip()
            phone = request.form.get("phone", "").strip()
            email = request.form.get("email", "").strip()
            branch_id = request.form.get("branch_id")
            if session.get("role") != "admin":
                branch_id = session.get("branch_id")

            if not name or not branch_id:
                flash("Customer name and branch are required.", "error")
                return redirect(url_for("customers"))

            cur = db.execute(
                "INSERT INTO customers(name, phone, email, branch_id) VALUES(?,?,?,?)",
                (name, phone, email, int(branch_id)),
            )
            db.commit()
            log_action("create", "customer", cur.lastrowid, f"{name}")
            flash("Customer created.", "success")
            return redirect(url_for("customers"))

        q = request.args.get("q", "").strip()
        branch_filter = request.args.get("branch_id", "").strip()
        conditions, params = branch_scope("c")
        if q:
            conditions.append("(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR b.name LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])
        if session.get("role") == "admin" and branch_filter:
            conditions.append("c.branch_id = ?")
            params.append(int(branch_filter))

        base = (
            "SELECT c.id, c.name, c.phone, c.email, c.branch_id, b.name AS branch_name "
            "FROM customers c JOIN branches b ON b.id = c.branch_id "
            f"{build_where(conditions)} ORDER BY c.id DESC"
        )
        rows, page, pages, total = paginate(base, params)
        branches_rows = db.execute("SELECT id, name FROM branches ORDER BY name").fetchall()
        return render_template(
            "customers.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
            branches=branches_rows,
            branch_filter=branch_filter,
        )

    @app.route("/purchases", methods=["GET", "POST"])
    @role_required("manager")
    def purchases():
        db = get_db()

        if request.method == "POST":
            try:
                product_id = int(request.form.get("product_id", "0"))
                qty = int(request.form.get("qty", "0"))
                unit_cost = float(request.form.get("unit_cost", "0"))
            except ValueError:
                flash("Invalid numeric values for purchase.", "error")
                return redirect(url_for("purchases"))

            vendor_raw = request.form.get("vendor_id", "").strip()
            vendor_id = int(vendor_raw) if vendor_raw else None

            branch_id_raw = request.form.get("branch_id")
            if session.get("role") != "admin":
                branch_id_raw = str(session.get("branch_id"))
            if not branch_id_raw:
                flash("Branch is required.", "error")
                return redirect(url_for("purchases"))
            branch_id = int(branch_id_raw)

            if qty <= 0 or unit_cost <= 0:
                flash("Quantity and unit cost must be greater than zero.", "error")
                return redirect(url_for("purchases"))

            if not ensure_branch_allowed(branch_id):
                flash("Invalid branch for your role.", "error")
                return redirect(url_for("purchases"))

            product = db.execute(
                "SELECT id, name, branch_id FROM products WHERE id = ?",
                (product_id,),
            ).fetchone()
            if not product or product["branch_id"] != branch_id:
                flash("Product not found in selected branch.", "error")
                return redirect(url_for("purchases"))

            if vendor_id is not None:
                vendor = db.execute(
                    "SELECT id, branch_id FROM vendors WHERE id = ?",
                    (vendor_id,),
                ).fetchone()
                if not vendor or vendor["branch_id"] != branch_id:
                    flash("Vendor not valid for selected branch.", "error")
                    return redirect(url_for("purchases"))

            cur = db.execute(
                """
                INSERT INTO purchases(branch_id, vendor_id, product_id, qty, unit_cost, created_by)
                VALUES(?,?,?,?,?,?)
                """,
                (branch_id, vendor_id, product_id, qty, unit_cost, session["user_id"]),
            )
            db.execute("UPDATE inventory SET qty = qty + ? WHERE product_id = ?", (qty, product_id))
            db.commit()
            log_action(
                "create",
                "purchase",
                cur.lastrowid,
                f"product={product_id} qty={qty} cost={unit_cost}",
            )
            create_notification("info", f"Purchase recorded for {product['name']} (qty {qty})")
            flash("Purchase recorded.", "success")
            return redirect(url_for("purchases"))

        q = request.args.get("q", "").strip()
        branch_filter = request.args.get("branch_id", "").strip()

        conditions, params = branch_scope("pu")
        if q:
            conditions.append(
                "(CAST(pu.id AS TEXT) LIKE ? OR p.name LIKE ? OR COALESCE(v.name,'') LIKE ? OR b.name LIKE ?)"
            )
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])
        if session.get("role") == "admin" and branch_filter:
            conditions.append("pu.branch_id = ?")
            params.append(int(branch_filter))

        base = (
            "SELECT pu.id, pu.created_at, pu.qty, pu.unit_cost, pu.branch_id, "
            "p.name AS product_name, COALESCE(v.name, '-') AS vendor_name, "
            "b.name AS branch_name, u.username AS created_by_name "
            "FROM purchases pu "
            "JOIN products p ON p.id = pu.product_id "
            "LEFT JOIN vendors v ON v.id = pu.vendor_id "
            "JOIN branches b ON b.id = pu.branch_id "
            "LEFT JOIN users u ON u.id = pu.created_by "
            f"{build_where(conditions)} ORDER BY pu.id DESC"
        )
        rows, page, pages, total = paginate(base, params)

        product_conditions, product_params = branch_scope("p")
        products = db.execute(
            "SELECT p.id, p.name, p.branch_id, b.name AS branch_name "
            "FROM products p JOIN branches b ON b.id = p.branch_id "
            f"{build_where(product_conditions)} ORDER BY p.name",
            tuple(product_params),
        ).fetchall()

        vendor_conditions, vendor_params = branch_scope("v")
        vendors_rows = db.execute(
            "SELECT v.id, v.name, v.branch_id, b.name AS branch_name "
            "FROM vendors v JOIN branches b ON b.id = v.branch_id "
            f"{build_where(vendor_conditions)} ORDER BY v.name",
            tuple(vendor_params),
        ).fetchall()
        branches_rows = db.execute("SELECT id, name FROM branches ORDER BY name").fetchall()

        return render_template(
            "purchases.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
            products=products,
            vendors=vendors_rows,
            branches=branches_rows,
            branch_filter=branch_filter,
        )

    @app.route("/sales")
    @role_required("staff")
    def sales():
        db = get_db()
        q = request.args.get("q", "").strip()
        branch_filter = request.args.get("branch_id", "").strip()

        conditions, params = branch_scope("s")
        if q:
            conditions.append(
                "(CAST(s.id AS TEXT) LIKE ? OR COALESCE(c.name,'') LIKE ? OR b.name LIKE ? OR COALESCE(u.username,'') LIKE ?)"
            )
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])
        if session.get("role") == "admin" and branch_filter:
            conditions.append("s.branch_id = ?")
            params.append(int(branch_filter))

        base = (
            "SELECT s.id, s.created_at, s.total, s.margin, s.branch_id, "
            "COALESCE(c.name, 'Walk-in') AS customer_name, b.name AS branch_name, "
            "COALESCE(u.username, '-') AS created_by_name "
            "FROM sales s "
            "LEFT JOIN customers c ON c.id = s.customer_id "
            "JOIN branches b ON b.id = s.branch_id "
            "LEFT JOIN users u ON u.id = s.created_by "
            f"{build_where(conditions)} ORDER BY s.id DESC"
        )
        rows, page, pages, total = paginate(base, params)
        branches_rows = db.execute("SELECT id, name FROM branches ORDER BY name").fetchall()
        return render_template(
            "sales.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
            branches=branches_rows,
            branch_filter=branch_filter,
        )

    @app.route("/sales/new", methods=["GET", "POST"])
    @role_required("staff")
    def sales_new():
        db = get_db()
        if request.method == "POST":
            branch_raw = request.form.get("branch_id")
            if session.get("role") != "admin":
                branch_raw = str(session.get("branch_id"))
            if not branch_raw:
                flash("Branch is required.", "error")
                return redirect(url_for("sales_new"))
            branch_id = int(branch_raw)

            if not ensure_branch_allowed(branch_id):
                flash("Invalid branch for your role.", "error")
                return redirect(url_for("sales_new"))

            customer_raw = request.form.get("customer_id", "").strip()
            customer_id = int(customer_raw) if customer_raw else None
            if customer_id:
                customer = db.execute(
                    "SELECT id, branch_id FROM customers WHERE id = ?",
                    (customer_id,),
                ).fetchone()
                if not customer or (
                    session.get("role") != "admin" and customer["branch_id"] != session.get("branch_id")
                ):
                    flash("Customer not valid for your branch.", "error")
                    return redirect(url_for("sales_new"))

            product_ids = request.form.getlist("product_id")
            qtys = request.form.getlist("qty")

            items = []
            total = 0.0
            margin = 0.0
            for pid_raw, qty_raw in zip(product_ids, qtys):
                if not pid_raw.strip() or not qty_raw.strip():
                    continue

                try:
                    pid = int(pid_raw)
                    qty = int(qty_raw)
                except ValueError:
                    flash("Invalid product/qty values.", "error")
                    return redirect(url_for("sales_new"))

                if qty <= 0:
                    flash("Quantity must be greater than zero.", "error")
                    return redirect(url_for("sales_new"))

                product = db.execute(
                    """
                    SELECT p.id, p.name, p.cost_price, p.sell_price, p.branch_id, i.qty AS available_qty
                    FROM products p
                    JOIN inventory i ON i.product_id = p.id
                    WHERE p.id = ?
                    """,
                    (pid,),
                ).fetchone()

                if not product or product["branch_id"] != branch_id:
                    flash("Selected product does not belong to selected branch.", "error")
                    return redirect(url_for("sales_new"))

                if product["available_qty"] < qty:
                    flash(f"Insufficient stock for {product['name']}.", "error")
                    return redirect(url_for("sales_new"))

                line_total = qty * product["sell_price"]
                line_margin = qty * (product["sell_price"] - product["cost_price"])
                total += line_total
                margin += line_margin
                items.append(
                    {
                        "product_id": pid,
                        "product_name": product["name"],
                        "qty": qty,
                        "unit_price": product["sell_price"],
                        "unit_cost": product["cost_price"],
                    }
                )

            if not items:
                flash("Add at least one sale item.", "error")
                return redirect(url_for("sales_new"))

            cur = db.execute(
                "INSERT INTO sales(branch_id, customer_id, total, margin, created_by) VALUES(?,?,?,?,?)",
                (branch_id, customer_id, total, margin, session.get("user_id")),
            )
            sale_id = cur.lastrowid
            for item in items:
                db.execute(
                    "INSERT INTO sales_items(sale_id, product_id, qty, unit_price, unit_cost) VALUES(?,?,?,?,?)",
                    (
                        sale_id,
                        item["product_id"],
                        item["qty"],
                        item["unit_price"],
                        item["unit_cost"],
                    ),
                )
                db.execute(
                    "UPDATE inventory SET qty = qty - ? WHERE product_id = ?",
                    (item["qty"], item["product_id"]),
                )

            db.commit()
            log_action("create", "sale", sale_id, f"total={total:.2f}; items={len(items)}")
            create_notification("success", f"Sale #{sale_id} recorded ({total:.2f})")
            detect_low_stock_notifications(commit=True)
            return redirect(url_for("invoice", sale_id=sale_id))

        customer_conditions, customer_params = branch_scope("c")
        customers_rows = db.execute(
            "SELECT c.id, c.name, c.branch_id, b.name AS branch_name "
            "FROM customers c JOIN branches b ON b.id = c.branch_id "
            f"{build_where(customer_conditions)} ORDER BY c.name",
            tuple(customer_params),
        ).fetchall()

        product_conditions, product_params = branch_scope("p")
        products_rows = db.execute(
            "SELECT p.id, p.name, p.sell_price, p.branch_id, i.qty, b.name AS branch_name "
            "FROM products p "
            "JOIN inventory i ON i.product_id = p.id "
            "JOIN branches b ON b.id = p.branch_id "
            f"{build_where(product_conditions)} ORDER BY p.name",
            tuple(product_params),
        ).fetchall()

        if session.get("role") == "admin":
            branches_rows = db.execute("SELECT id, name FROM branches ORDER BY name").fetchall()
        else:
            branches_rows = db.execute(
                "SELECT id, name FROM branches WHERE id = ?",
                (session.get("branch_id"),),
            ).fetchall()

        return render_template(
            "sale_new.html",
            customers=customers_rows,
            products=products_rows,
            branches=branches_rows,
            selected_branch=session.get("branch_id"),
        )

    @app.route("/invoice/<int:sale_id>")
    @role_required("staff")
    def invoice(sale_id):
        db = get_db()
        sale = fetch_sale(sale_id)
        if not sale:
            abort(404)
        items = db.execute(
            """
            SELECT si.id, si.qty, si.unit_price, si.unit_cost, p.name AS product_name
            FROM sales_items si
            JOIN products p ON p.id = si.product_id
            WHERE si.sale_id = ?
            ORDER BY si.id
            """,
            (sale_id,),
        ).fetchall()
        return render_template("invoice.html", sale=sale, items=items)

    @app.route("/invoice/<int:sale_id>.pdf")
    @role_required("staff")
    def invoice_pdf(sale_id):
        db = get_db()
        sale = fetch_sale(sale_id)
        if not sale:
            abort(404)
        items = db.execute(
            """
            SELECT si.id, si.qty, si.unit_price, si.unit_cost, p.name AS product_name
            FROM sales_items si
            JOIN products p ON p.id = si.product_id
            WHERE si.sale_id = ?
            ORDER BY si.id
            """,
            (sale_id,),
        ).fetchall()
        pdf_bytes = invoice_pdf_bytes(sale, items)
        return send_file(
            io.BytesIO(pdf_bytes),
            as_attachment=True,
            download_name=f"invoice_{sale_id}.pdf",
            mimetype="application/pdf",
        )

    def export_rows(entity):
        db = get_db()
        role = session.get("role")
        branch_id = session.get("branch_id")

        if entity == "branches":
            return db.execute(
                "SELECT id, name, location FROM branches ORDER BY id DESC"
            ).fetchall()

        if entity == "inventory":
            query = (
                "SELECT p.sku, p.name, p.category, b.name AS branch, i.qty, i.reorder_level, "
                "p.cost_price, p.sell_price "
                "FROM products p JOIN branches b ON b.id = p.branch_id "
                "JOIN inventory i ON i.product_id = p.id"
            )
            params = ()
            if role != "admin":
                query += " WHERE p.branch_id = ?"
                params = (branch_id,)
            query += " ORDER BY p.id DESC"
            return db.execute(query, params).fetchall()

        if entity == "purchases":
            query = (
                "SELECT pu.id, pu.created_at, b.name AS branch, COALESCE(v.name, '-') AS vendor, "
                "p.name AS product, pu.qty, pu.unit_cost "
                "FROM purchases pu "
                "JOIN branches b ON b.id = pu.branch_id "
                "LEFT JOIN vendors v ON v.id = pu.vendor_id "
                "JOIN products p ON p.id = pu.product_id"
            )
            params = ()
            if role != "admin":
                query += " WHERE pu.branch_id = ?"
                params = (branch_id,)
            query += " ORDER BY pu.id DESC"
            return db.execute(query, params).fetchall()

        if entity == "sales":
            query = (
                "SELECT s.id, s.created_at, b.name AS branch, COALESCE(c.name, 'Walk-in') AS customer, "
                "s.total, s.margin "
                "FROM sales s "
                "JOIN branches b ON b.id = s.branch_id "
                "LEFT JOIN customers c ON c.id = s.customer_id"
            )
            params = ()
            if role != "admin":
                query += " WHERE s.branch_id = ?"
                params = (branch_id,)
            query += " ORDER BY s.id DESC"
            return db.execute(query, params).fetchall()

        if entity == "customers":
            query = (
                "SELECT c.id, c.name, c.phone, c.email, b.name AS branch "
                "FROM customers c JOIN branches b ON b.id = c.branch_id"
            )
            params = ()
            if role != "admin":
                query += " WHERE c.branch_id = ?"
                params = (branch_id,)
            query += " ORDER BY c.id DESC"
            return db.execute(query, params).fetchall()

        if entity == "vendors":
            query = (
                "SELECT v.id, v.name, v.contact, b.name AS branch "
                "FROM vendors v JOIN branches b ON b.id = v.branch_id"
            )
            params = ()
            if role != "admin":
                query += " WHERE v.branch_id = ?"
                params = (branch_id,)
            query += " ORDER BY v.id DESC"
            return db.execute(query, params).fetchall()

        if entity == "audit":
            if ROLES[role] < ROLES["manager"]:
                abort(403)
            query = (
                "SELECT a.id, a.created_at, COALESCE(u.username, 'system') AS username, "
                "a.action, a.entity, COALESCE(a.details, '') AS details "
                "FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id"
            )
            params = ()
            if role != "admin":
                query += " WHERE (u.branch_id = ? OR u.branch_id IS NULL)"
                params = (branch_id,)
            query += " ORDER BY a.id DESC"
            return db.execute(query, params).fetchall()

        raise KeyError(entity)

    @app.route("/export/<entity>.csv")
    @role_required("staff")
    def export_csv(entity):
        try:
            rows = export_rows(entity)
        except KeyError:
            abort(404)

        output = io.StringIO()
        writer = csv.writer(output)
        if rows:
            headers = rows[0].keys()
            writer.writerow(headers)
            for row in rows:
                writer.writerow([row[h] for h in headers])

        log_action("export", entity, details="csv export")
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={entity}.csv"},
        )

    @app.route("/export/<entity>.pdf")
    @role_required("staff")
    def export_pdf(entity):
        try:
            rows = export_rows(entity)
        except KeyError:
            abort(404)

        pdf_bytes = table_pdf_bytes(f"{entity.title()} Export", rows)
        log_action("export", entity, details="pdf export")
        return send_file(
            io.BytesIO(pdf_bytes),
            as_attachment=True,
            download_name=f"{entity}.pdf",
            mimetype="application/pdf",
        )

    @app.route("/notifications", methods=["GET", "POST"])
    @role_required("staff")
    def notifications():
        db = get_db()
        if request.method == "POST":
            action = request.form.get("action")
            if action == "mark_read":
                nid = int(request.form.get("id", "0"))
                db.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (nid,))
            elif action == "mark_all_read":
                db.execute("UPDATE notifications SET is_read = 1 WHERE is_read = 0")
            db.commit()
            return redirect(url_for("notifications"))

        q = request.args.get("q", "").strip()
        unread_only = request.args.get("unread") == "1"
        conditions = []
        params = []
        if q:
            conditions.append("(level LIKE ? OR message LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%"])
        if unread_only:
            conditions.append("is_read = 0")

        base = (
            "SELECT id, level, message, is_read, created_at FROM notifications "
            f"{build_where(conditions)} ORDER BY id DESC"
        )
        rows, page, pages, total = paginate(base, params)
        return render_template(
            "notifications.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
            unread_only=unread_only,
        )

    @app.route("/audit")
    @role_required("manager")
    def audit():
        q = request.args.get("q", "").strip()
        conditions = []
        params = []

        if session.get("role") != "admin":
            conditions.append("(u.branch_id = ? OR u.branch_id IS NULL)")
            params.append(session.get("branch_id"))

        if q:
            conditions.append(
                "(COALESCE(u.username,'') LIKE ? OR a.action LIKE ? OR a.entity LIKE ? OR COALESCE(a.details,'') LIKE ?)"
            )
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])

        base = (
            "SELECT a.id, a.created_at, a.action, a.entity, a.entity_id, a.details, "
            "COALESCE(u.username, 'system') AS username "
            "FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id "
            f"{build_where(conditions)} ORDER BY a.id DESC"
        )
        rows, page, pages, total = paginate(base, params)
        return render_template(
            "audit.html",
            rows=rows,
            page=page,
            pages=pages,
            total=total,
            q=q,
        )

    @app.route("/api/kpis")
    @role_required("staff")
    def api_kpis():
        db = get_db()

        sales_conditions = ["date(s.created_at) = date('now')"]
        sales_params = []
        scope_conditions, scope_params = branch_scope("s")
        sales_conditions.extend(scope_conditions)
        sales_params.extend(scope_params)

        daily_sales = db.execute(
            f"SELECT COALESCE(SUM(s.total), 0) AS v FROM sales s{build_where(sales_conditions)}",
            tuple(sales_params),
        ).fetchone()["v"]
        daily_margin = db.execute(
            f"SELECT COALESCE(SUM(s.margin), 0) AS v FROM sales s{build_where(sales_conditions)}",
            tuple(sales_params),
        ).fetchone()["v"]

        cogs_conditions, cogs_params = branch_scope("s")
        cogs = db.execute(
            "SELECT COALESCE(SUM(si.qty * si.unit_cost), 0) AS v "
            "FROM sales_items si JOIN sales s ON s.id = si.sale_id"
            f"{build_where(cogs_conditions)}",
            tuple(cogs_params),
        ).fetchone()["v"]

        inv_conditions, inv_params = branch_scope("p")
        avg_inventory = db.execute(
            "SELECT COALESCE(AVG(i.qty * p.cost_price), 0) AS v "
            "FROM inventory i JOIN products p ON p.id = i.product_id"
            f"{build_where(inv_conditions)}",
            tuple(inv_params),
        ).fetchone()["v"]
        stock_turnover = round(cogs / avg_inventory, 2) if avg_inventory else 0.0

        return jsonify(
            {
                "daily_sales": round(daily_sales, 2),
                "daily_margin": round(daily_margin, 2),
                "stock_turnover": stock_turnover,
            }
        )

    def seed_data(reset=False):
        db = get_db()
        if reset:
            init_db()

        existing = db.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if existing > 0:
            return

        random.seed(42)

        branches = [
            ("Central", "Downtown"),
            ("North", "Uptown"),
            ("South", "Harbor District"),
        ]
        db.executemany("INSERT INTO branches(name, location) VALUES(?, ?)", branches)
        branch_map = {
            row["name"]: row["id"]
            for row in db.execute("SELECT id, name FROM branches").fetchall()
        }

        user_rows = []
        for username, password, role, branch_name in DEFAULT_USERS:
            branch_id = branch_map.get(branch_name)
            user_rows.append(
                (username, generate_password_hash(password), role, branch_id)
            )
        db.executemany(
            "INSERT INTO users(username, password, role, branch_id) VALUES(?,?,?,?)",
            user_rows,
        )

        vendor_seed = {
            "Central": ["Metro Supply Co", "DailyFresh Wholesale", "City Beverage Hub"],
            "North": ["Northline Food Traders", "Evergreen Dairy", "Peak Snacks"],
            "South": ["Harbor Grains", "Sunrise Produce Depot", "Seaside Essentials"],
        }
        for branch_name, names in vendor_seed.items():
            for vendor_name in names:
                db.execute(
                    "INSERT INTO vendors(name, contact, branch_id) VALUES(?,?,?)",
                    (vendor_name, f"+1-555-{random.randint(1000, 9999)}", branch_map[branch_name]),
                )

        first_names = [
            "Avery",
            "Jordan",
            "Casey",
            "Taylor",
            "Morgan",
            "Jamie",
            "Riley",
            "Cameron",
            "Quinn",
            "Parker",
            "Drew",
            "Skyler",
        ]
        for branch_name, branch_id in branch_map.items():
            for idx in range(1, 13):
                name = f"{random.choice(first_names)} {branch_name[:2]}{idx:02d}"
                db.execute(
                    "INSERT INTO customers(name, phone, email, branch_id) VALUES(?,?,?,?)",
                    (
                        name,
                        f"+1-415-55{random.randint(1000, 9999)}",
                        f"{name.lower().replace(' ', '.')}@mail.test",
                        branch_id,
                    ),
                )

        catalog = [
            ("Whole Milk 1L", "Dairy"),
            ("Greek Yogurt", "Dairy"),
            ("Brown Bread", "Bakery"),
            ("Whole Wheat Bread", "Bakery"),
            ("Arabica Coffee", "Beverage"),
            ("Green Tea", "Beverage"),
            ("Basmati Rice 5kg", "Grains"),
            ("Pasta 500g", "Grains"),
            ("Tomato Sauce", "Pantry"),
            ("Olive Oil 1L", "Pantry"),
            ("Potato Chips", "Snacks"),
            ("Protein Bars", "Snacks"),
        ]

        product_ids_by_branch = {}
        sku_counter = 1000
        for branch_name, branch_id in branch_map.items():
            product_ids_by_branch[branch_id] = []
            for product_name, category in catalog:
                sku_counter += 1
                cost = round(random.uniform(2.5, 25.0), 2)
                sell = round(cost * random.uniform(1.25, 1.65), 2)
                product_id = db.execute(
                    "INSERT INTO products(sku, name, category, cost_price, sell_price, branch_id) VALUES(?,?,?,?,?,?)",
                    (
                        f"{branch_name[:2].upper()}-{sku_counter}",
                        product_name,
                        category,
                        cost,
                        sell,
                        branch_id,
                    ),
                ).lastrowid
                qty = random.randint(35, 140)
                reorder = random.randint(8, 24)
                db.execute(
                    "INSERT INTO inventory(product_id, qty, reorder_level) VALUES(?,?,?)",
                    (product_id, qty, reorder),
                )
                product_ids_by_branch[branch_id].append(product_id)

        users = db.execute("SELECT id, role, branch_id FROM users").fetchall()
        branch_staff = {
            row["branch_id"]: row["id"]
            for row in users
            if row["role"] in {"staff", "manager"} and row["branch_id"]
        }

        vendor_ids_by_branch = {}
        for branch_id in branch_map.values():
            vendor_ids_by_branch[branch_id] = [
                row["id"]
                for row in db.execute(
                    "SELECT id FROM vendors WHERE branch_id = ?", (branch_id,)
                ).fetchall()
            ]

        customer_ids_by_branch = {}
        for branch_id in branch_map.values():
            customer_ids_by_branch[branch_id] = [
                row["id"]
                for row in db.execute(
                    "SELECT id FROM customers WHERE branch_id = ?", (branch_id,)
                ).fetchall()
            ]

        for day_offset in range(45, 0, -1):
            event_time = (datetime.utcnow() - timedelta(days=day_offset)).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            for branch_id in branch_map.values():
                for _ in range(random.randint(1, 3)):
                    pid = random.choice(product_ids_by_branch[branch_id])
                    qty = random.randint(6, 22)
                    unit_cost = db.execute(
                        "SELECT cost_price FROM products WHERE id = ?", (pid,)
                    ).fetchone()["cost_price"]
                    vendor_id = random.choice(vendor_ids_by_branch[branch_id])
                    creator = branch_staff[branch_id]
                    db.execute(
                        """
                        INSERT INTO purchases(branch_id, vendor_id, product_id, qty, unit_cost, created_at, created_by)
                        VALUES(?,?,?,?,?,?,?)
                        """,
                        (branch_id, vendor_id, pid, qty, unit_cost, event_time, creator),
                    )
                    db.execute(
                        "UPDATE inventory SET qty = qty + ? WHERE product_id = ?",
                        (qty, pid),
                    )

        for day_offset in range(30, -1, -1):
            event_time = (datetime.utcnow() - timedelta(days=day_offset)).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            for branch_id in branch_map.values():
                for _ in range(random.randint(2, 6)):
                    selected_products = random.sample(product_ids_by_branch[branch_id], k=3)
                    total = 0.0
                    margin = 0.0
                    sale_lines = []
                    for pid in selected_products:
                        product = db.execute(
                            "SELECT cost_price, sell_price FROM products WHERE id = ?",
                            (pid,),
                        ).fetchone()
                        available = db.execute(
                            "SELECT qty FROM inventory WHERE product_id = ?", (pid,)
                        ).fetchone()["qty"]
                        if available <= 0:
                            continue
                        qty = min(random.randint(1, 5), available)
                        if qty <= 0:
                            continue
                        total += qty * product["sell_price"]
                        margin += qty * (product["sell_price"] - product["cost_price"])
                        sale_lines.append((pid, qty, product["sell_price"], product["cost_price"]))

                    if not sale_lines:
                        continue

                    customer_id = random.choice(customer_ids_by_branch[branch_id])
                    creator = branch_staff[branch_id]
                    sale_id = db.execute(
                        """
                        INSERT INTO sales(branch_id, customer_id, total, margin, created_at, created_by)
                        VALUES(?,?,?,?,?,?)
                        """,
                        (
                            branch_id,
                            customer_id,
                            round(total, 2),
                            round(margin, 2),
                            event_time,
                            creator,
                        ),
                    ).lastrowid

                    for pid, qty, unit_price, unit_cost in sale_lines:
                        db.execute(
                            """
                            INSERT INTO sales_items(sale_id, product_id, qty, unit_price, unit_cost)
                            VALUES(?,?,?,?,?)
                            """,
                            (sale_id, pid, qty, unit_price, unit_cost),
                        )
                        db.execute(
                            "UPDATE inventory SET qty = qty - ? WHERE product_id = ?",
                            (qty, pid),
                        )

        for branch_id in branch_map.values():
            low_candidate = random.choice(product_ids_by_branch[branch_id])
            db.execute(
                "UPDATE inventory SET qty = max(reorder_level - 1, 0) WHERE product_id = ?",
                (low_candidate,),
            )

        db.execute(
            "INSERT INTO notifications(level, message) VALUES(?, ?)",
            ("info", "Seed data loaded with realistic branch activity"),
        )

        admin_id = db.execute(
            "SELECT id FROM users WHERE username = 'admin'"
        ).fetchone()["id"]
        db.execute(
            "INSERT INTO audit_logs(user_id, action, entity, details) VALUES(?,?,?,?)",
            (admin_id, "seed", "database", "Initial seed data generated"),
        )

        db.commit()
        detect_low_stock_notifications(commit=True)

    @app.route("/seed")
    def seed_route():
        reset = request.args.get("reset") == "1"
        seed_data(reset=reset)
        return "seeded"

    @app.route("/init")
    def init_route():
        init_db()
        seed_data()
        return "initialized"

    app.get_db = get_db
    app.init_db = init_db
    app.seed_data = seed_data
    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
