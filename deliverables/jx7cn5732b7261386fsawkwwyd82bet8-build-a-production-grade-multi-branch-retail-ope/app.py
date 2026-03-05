import csv
import io
import os
import sqlite3
from contextlib import closing
from datetime import datetime
from functools import wraps

from flask import (
    Flask,
    Response,
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
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from werkzeug.security import check_password_hash, generate_password_hash


ROLES = {"admin": 3, "manager": 2, "staff": 1}


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY="dev-change-me",
        DATABASE=os.path.join(app.root_path, "retail.db"),
        PAGE_SIZE=10,
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
        if db:
            db.close()

    app.teardown_appcontext(close_db)

    def init_db():
        with closing(app.open_resource("schema.sql")) as f:
            get_db().executescript(f.read().decode("utf-8"))
        get_db().commit()

    def log_action(action, entity, entity_id=None, details=""):
        uid = session.get("user_id")
        get_db().execute(
            "INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)",
            (uid, action, entity, entity_id, details),
        )
        get_db().commit()

    def notify(level, message):
        get_db().execute(
            "INSERT INTO notifications(level,message) VALUES(?,?)", (level, message)
        )
        get_db().commit()

    def require_role(min_role="staff"):
        def dec(fn):
            @wraps(fn)
            def wrapper(*args, **kwargs):
                if not session.get("user_id"):
                    return redirect(url_for("login"))
                if ROLES[session["role"]] < ROLES[min_role]:
                    flash("Insufficient permissions", "error")
                    return redirect(url_for("dashboard"))
                return fn(*args, **kwargs)

            return wrapper

        return dec

    def scope_clause(alias=""):
        if session.get("role") == "admin":
            return "", []
        prefix = f"{alias}." if alias else ""
        return f" WHERE {prefix}branch_id = ?", [session["branch_id"]]

    def paginate(base_query, params):
        page = max(int(request.args.get("page", 1)), 1)
        size = app.config["PAGE_SIZE"]
        query = f"{base_query} LIMIT ? OFFSET ?"
        rows = get_db().execute(query, (*params, size, (page - 1) * size)).fetchall()
        count = get_db().execute(f"SELECT COUNT(*) c FROM ({base_query})", params).fetchone()["c"]
        return rows, page, (count + size - 1) // size

    def enforce_low_stock():
        rows = get_db().execute(
            """
            SELECT p.name, b.name branch, i.qty, i.reorder_level FROM inventory i
            JOIN products p ON p.id=i.product_id
            JOIN branches b ON b.id=p.branch_id
            WHERE i.qty <= i.reorder_level
            """
        ).fetchall()
        for r in rows:
            notify("warning", f"Low stock: {r['name']} @ {r['branch']} ({r['qty']}/{r['reorder_level']})")

    @app.cli.command("init-db")
    def init_db_command():
        init_db()
        print("Initialized")

    @app.context_processor
    def inject_user():
        return {"current_user": session, "now": datetime.utcnow}

    @app.route("/")
    def index():
        return redirect(url_for("dashboard" if session.get("user_id") else "login"))

    @app.route("/init")
    def web_init():
        init_db()
        seed_data()
        return "ok"

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            username = request.form["username"].strip()
            password = request.form["password"]
            user = get_db().execute(
                "SELECT u.*, b.name branch_name FROM users u LEFT JOIN branches b ON b.id=u.branch_id WHERE username=?",
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
                        "branch_name": user["branch_name"] or "All",
                    }
                )
                log_action("login", "user", user["id"], "User logged in")
                return redirect(url_for("dashboard"))
            flash("Invalid credentials", "error")
        return render_template("login.html")

    @app.route("/logout")
    def logout():
        log_action("logout", "user", session.get("user_id"), "User logged out")
        session.clear()
        return redirect(url_for("login"))

    @app.route("/dashboard")
    @require_role("staff")
    def dashboard():
        where, params = scope_clause("s")
        sales_today = get_db().execute(
            f"SELECT COALESCE(SUM(total),0) v FROM sales s {where} AND date(created_at)=date('now')" if where else "SELECT COALESCE(SUM(total),0) v FROM sales s WHERE date(created_at)=date('now')",
            params,
        ).fetchone()["v"]
        margin = get_db().execute(
            f"SELECT COALESCE(SUM(margin),0) v FROM sales s {where}", params
        ).fetchone()["v"]
        cogs = get_db().execute(
            f"SELECT COALESCE(SUM(si.qty*si.unit_cost),0) v FROM sales_items si JOIN sales s ON s.id=si.sale_id {where}",
            params,
        ).fetchone()["v"]
        avg_inv = get_db().execute(
            "SELECT COALESCE(AVG(i.qty*p.cost_price),0) v FROM inventory i JOIN products p ON p.id=i.product_id"
        ).fetchone()["v"]
        turnover = round((cogs / avg_inv), 2) if avg_inv else 0
        low = get_db().execute(
            "SELECT COUNT(*) c FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.qty<=i.reorder_level"
        ).fetchone()["c"]
        return render_template(
            "dashboard.html",
            sales_today=round(sales_today, 2),
            margin=round(margin, 2),
            turnover=turnover,
            low=low,
        )

    @app.route("/inventory")
    @require_role("staff")
    def inventory():
        q = request.args.get("q", "").strip()
        where, params = scope_clause("p")
        cond = ""
        if q:
            cond = (" AND " if where else " WHERE ") + "(p.name LIKE ? OR p.sku LIKE ? OR p.category LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
        base = (
            "SELECT p.*, b.name branch, i.qty, i.reorder_level FROM products p "
            "JOIN branches b ON b.id=p.branch_id JOIN inventory i ON i.product_id=p.id"
            f"{where}{cond} ORDER BY p.id DESC"
        )
        rows, page, pages = paginate(base, params)
        return render_template("inventory.html", rows=rows, page=page, pages=pages, q=q)

    @app.route("/inventory/export.csv")
    @require_role("staff")
    def inventory_csv():
        rows = get_db().execute(
            "SELECT p.sku,p.name,p.category,b.name branch,i.qty,i.reorder_level,p.cost_price,p.sell_price FROM products p JOIN branches b ON b.id=p.branch_id JOIN inventory i ON i.product_id=p.id ORDER BY p.id"
        ).fetchall()
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["SKU", "Name", "Category", "Branch", "Qty", "Reorder", "Cost", "Sell"])
        for r in rows:
            w.writerow([r[k] for k in r.keys()])
        return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=inventory.csv"})

    @app.route("/vendors", methods=["GET", "POST"])
    @require_role("manager")
    def vendors():
        db = get_db()
        if request.method == "POST":
            branch_id = request.form.get("branch_id") or session.get("branch_id")
            db.execute(
                "INSERT INTO vendors(name,contact,branch_id) VALUES(?,?,?)",
                (request.form["name"], request.form.get("contact"), branch_id),
            )
            db.commit()
            log_action("create", "vendor", db.execute("SELECT last_insert_rowid() id").fetchone()["id"], request.form["name"])
            return redirect(url_for("vendors"))
        q = request.args.get("q", "")
        where, params = scope_clause("v")
        if q:
            where += (" AND" if where else " WHERE") + " v.name LIKE ?"
            params.append(f"%{q}%")
        base = f"SELECT v.*, b.name branch FROM vendors v JOIN branches b ON b.id=v.branch_id {where} ORDER BY v.id DESC"
        rows, page, pages = paginate(base, params)
        branches = db.execute("SELECT * FROM branches ORDER BY name").fetchall()
        return render_template("vendors.html", rows=rows, branches=branches, page=page, pages=pages, q=q)

    @app.route("/customers", methods=["GET", "POST"])
    @require_role("staff")
    def customers():
        db = get_db()
        if request.method == "POST":
            branch_id = request.form.get("branch_id") or session.get("branch_id")
            db.execute(
                "INSERT INTO customers(name,phone,email,branch_id) VALUES(?,?,?,?)",
                (request.form["name"], request.form.get("phone"), request.form.get("email"), branch_id),
            )
            db.commit()
            log_action("create", "customer", db.execute("SELECT last_insert_rowid() id").fetchone()["id"], request.form["name"])
            return redirect(url_for("customers"))
        q = request.args.get("q", "")
        where, params = scope_clause("c")
        if q:
            where += (" AND" if where else " WHERE") + " (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
        base = f"SELECT c.*, b.name branch FROM customers c JOIN branches b ON b.id=c.branch_id {where} ORDER BY c.id DESC"
        rows, page, pages = paginate(base, params)
        branches = db.execute("SELECT * FROM branches ORDER BY name").fetchall()
        return render_template("customers.html", rows=rows, branches=branches, page=page, pages=pages, q=q)

    @app.route("/purchases", methods=["GET", "POST"])
    @require_role("manager")
    def purchases():
        db = get_db()
        if request.method == "POST":
            product_id = int(request.form["product_id"])
            qty = int(request.form["qty"])
            unit_cost = float(request.form["unit_cost"])
            branch_id = int(request.form.get("branch_id") or session.get("branch_id"))
            vendor_id = request.form.get("vendor_id") or None
            db.execute(
                "INSERT INTO purchases(branch_id,vendor_id,product_id,qty,unit_cost,created_by) VALUES(?,?,?,?,?,?)",
                (branch_id, vendor_id, product_id, qty, unit_cost, session["user_id"]),
            )
            db.execute("UPDATE inventory SET qty=qty+? WHERE product_id=?", (qty, product_id))
            db.commit()
            log_action("create", "purchase", db.execute("SELECT last_insert_rowid() id").fetchone()["id"], f"qty={qty}")
            return redirect(url_for("purchases"))
        where, params = scope_clause("pu")
        base = f"SELECT pu.*, p.name product, v.name vendor, b.name branch FROM purchases pu JOIN products p ON p.id=pu.product_id LEFT JOIN vendors v ON v.id=pu.vendor_id JOIN branches b ON b.id=pu.branch_id {where} ORDER BY pu.id DESC"
        rows, page, pages = paginate(base, params)
        products = db.execute("SELECT id,name FROM products ORDER BY name").fetchall()
        vendors_ = db.execute("SELECT id,name FROM vendors ORDER BY name").fetchall()
        branches = db.execute("SELECT * FROM branches ORDER BY name").fetchall()
        return render_template("purchases.html", rows=rows, products=products, vendors=vendors_, branches=branches, page=page, pages=pages)

    @app.route("/sales", methods=["GET"])
    @require_role("staff")
    def sales():
        q = request.args.get("q", "")
        where, params = scope_clause("s")
        if q:
            where += (" AND" if where else " WHERE") + " (c.name LIKE ? OR s.id LIKE ?)"
            params.extend([f"%{q}%", f"%{q}%"])
        base = (
            "SELECT s.*, c.name customer, b.name branch, u.username created_by_name FROM sales s "
            "LEFT JOIN customers c ON c.id=s.customer_id JOIN branches b ON b.id=s.branch_id "
            "LEFT JOIN users u ON u.id=s.created_by"
            f" {where} ORDER BY s.id DESC"
        )
        rows, page, pages = paginate(base, params)
        return render_template("sales.html", rows=rows, page=page, pages=pages, q=q)

    @app.route("/sales/new", methods=["GET", "POST"])
    @require_role("staff")
    def sale_new():
        db = get_db()
        if request.method == "POST":
            branch_id = int(request.form.get("branch_id") or session.get("branch_id"))
            customer_id = request.form.get("customer_id") or None
            items = []
            total = margin = 0.0
            for pid, qty in zip(request.form.getlist("product_id"), request.form.getlist("qty")):
                if not pid or not qty:
                    continue
                p = db.execute("SELECT * FROM products WHERE id=?", (int(pid),)).fetchone()
                qty_i = int(qty)
                inv = db.execute("SELECT qty FROM inventory WHERE product_id=?", (p["id"],)).fetchone()["qty"]
                if inv < qty_i:
                    flash(f"Insufficient stock for {p['name']}", "error")
                    return redirect(url_for("sale_new"))
                line_total = qty_i * p["sell_price"]
                line_margin = qty_i * (p["sell_price"] - p["cost_price"])
                total += line_total
                margin += line_margin
                items.append((p["id"], qty_i, p["sell_price"], p["cost_price"]))
            cur = db.execute(
                "INSERT INTO sales(branch_id,customer_id,total,margin,created_by) VALUES(?,?,?,?,?)",
                (branch_id, customer_id, total, margin, session["user_id"]),
            )
            sale_id = cur.lastrowid
            for pid, qty_i, up, uc in items:
                db.execute(
                    "INSERT INTO sales_items(sale_id,product_id,qty,unit_price,unit_cost) VALUES(?,?,?,?,?)",
                    (sale_id, pid, qty_i, up, uc),
                )
                db.execute("UPDATE inventory SET qty=qty-? WHERE product_id=?", (qty_i, pid))
            db.commit()
            enforce_low_stock()
            log_action("create", "sale", sale_id, f"total={total}")
            return redirect(url_for("invoice", sale_id=sale_id))
        customers_ = db.execute("SELECT id,name FROM customers ORDER BY name").fetchall()
        products = db.execute(
            "SELECT p.id,p.name,p.sell_price,i.qty,b.name branch FROM products p JOIN inventory i ON i.product_id=p.id JOIN branches b ON b.id=p.branch_id ORDER BY p.name"
        ).fetchall()
        branches = db.execute("SELECT * FROM branches ORDER BY name").fetchall()
        return render_template("sale_new.html", customers=customers_, products=products, branches=branches)

    @app.route("/invoice/<int:sale_id>")
    @require_role("staff")
    def invoice(sale_id):
        db = get_db()
        s = db.execute(
            "SELECT s.*, c.name customer, b.name branch, u.username seller FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN branches b ON b.id=s.branch_id LEFT JOIN users u ON u.id=s.created_by WHERE s.id=?",
            (sale_id,),
        ).fetchone()
        items = db.execute(
            "SELECT si.*, p.name product FROM sales_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=?",
            (sale_id,),
        ).fetchall()
        return render_template("invoice.html", sale=s, items=items)

    @app.route("/invoice/<int:sale_id>.pdf")
    @require_role("staff")
    def invoice_pdf(sale_id):
        db = get_db()
        s = db.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
        items = db.execute("SELECT si.*, p.name product FROM sales_items si JOIN products p ON p.id=si.product_id WHERE sale_id=?", (sale_id,)).fetchall()
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        c.drawString(50, 800, f"Invoice #{sale_id}")
        c.drawString(50, 780, f"Date: {s['created_at']}")
        y = 740
        for it in items:
            c.drawString(50, y, f"{it['product']} x{it['qty']} @ {it['unit_price']}")
            y -= 20
        c.drawString(50, y - 20, f"Total: {s['total']}")
        c.save()
        buf.seek(0)
        return send_file(buf, as_attachment=True, download_name=f"invoice_{sale_id}.pdf", mimetype="application/pdf")

    @app.route("/sales/export.csv")
    @require_role("staff")
    def sales_csv():
        rows = get_db().execute(
            "SELECT s.id,s.created_at,b.name branch,c.name customer,s.total,s.margin FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN branches b ON b.id=s.branch_id ORDER BY s.id DESC"
        ).fetchall()
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["ID", "Date", "Branch", "Customer", "Total", "Margin"])
        for r in rows:
            w.writerow([r[k] for k in r.keys()])
        return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=sales.csv"})

    @app.route('/export/<entity>.csv')
    @require_role('staff')
    def export_csv(entity):
        mapping = {
            'inventory': "SELECT p.sku,p.name,p.category,b.name branch,i.qty,i.reorder_level,p.cost_price,p.sell_price FROM products p JOIN branches b ON b.id=p.branch_id JOIN inventory i ON i.product_id=p.id ORDER BY p.id",
            'sales': "SELECT s.id,s.created_at,b.name branch,c.name customer,s.total,s.margin FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN branches b ON b.id=s.branch_id ORDER BY s.id DESC",
            'purchases': "SELECT pu.id,pu.created_at,b.name branch,v.name vendor,p.name product,pu.qty,pu.unit_cost FROM purchases pu JOIN branches b ON b.id=pu.branch_id LEFT JOIN vendors v ON v.id=pu.vendor_id JOIN products p ON p.id=pu.product_id ORDER BY pu.id DESC",
            'customers': "SELECT c.id,c.name,c.phone,c.email,b.name branch FROM customers c JOIN branches b ON b.id=c.branch_id ORDER BY c.id DESC",
            'vendors': "SELECT v.id,v.name,v.contact,b.name branch FROM vendors v JOIN branches b ON b.id=v.branch_id ORDER BY v.id DESC",
            'audit': "SELECT a.id,a.created_at,u.username,a.action,a.entity,a.details FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC",
        }
        q = mapping.get(entity)
        if not q:
            return Response('Invalid export entity', status=400)
        rows = get_db().execute(q).fetchall()
        out = io.StringIO(); w = csv.writer(out)
        if rows:
            w.writerow(rows[0].keys())
            for r in rows:
                w.writerow([r[k] for k in r.keys()])
        return Response(out.getvalue(), mimetype='text/csv', headers={"Content-Disposition": f"attachment; filename={entity}.csv"})

    @app.route("/notifications", methods=["GET", "POST"])
    @require_role("staff")
    def notifications():
        db = get_db()
        if request.method == "POST":
            nid = int(request.form["id"])
            db.execute("UPDATE notifications SET is_read=1 WHERE id=?", (nid,))
            db.commit()
        rows = db.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT 100").fetchall()
        return render_template("notifications.html", rows=rows)

    @app.route("/audit")
    @require_role("manager")
    def audit():
        q = request.args.get("q", "")
        params = []
        where = ""
        if q:
            where = "WHERE a.action LIKE ? OR a.entity LIKE ? OR a.details LIKE ?"
            params = [f"%{q}%"] * 3
        base = f"SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id {where} ORDER BY a.id DESC"
        rows, page, pages = paginate(base, params)
        return render_template("audit.html", rows=rows, q=q, page=page, pages=pages)

    @app.route("/api/kpis")
    @require_role("staff")
    def api_kpis():
        db = get_db()
        data = {
            "daily_sales": db.execute("SELECT COALESCE(SUM(total),0) v FROM sales WHERE date(created_at)=date('now')").fetchone()["v"],
            "total_margin": db.execute("SELECT COALESCE(SUM(margin),0) v FROM sales").fetchone()["v"],
            "stock_turnover": 0,
        }
        cogs = db.execute("SELECT COALESCE(SUM(qty*unit_cost),0) v FROM sales_items").fetchone()["v"]
        avg_inv = db.execute("SELECT COALESCE(AVG(i.qty*p.cost_price),0) v FROM inventory i JOIN products p ON p.id=i.product_id").fetchone()["v"]
        data["stock_turnover"] = round((cogs / avg_inv), 2) if avg_inv else 0
        return jsonify(data)

    def seed_data():
        db = get_db()
        if db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] > 0:
            return
        branches = [("Central", "Downtown"), ("North", "Uptown")]
        db.executemany("INSERT INTO branches(name,location) VALUES(?,?)", branches)
        b1, b2 = [r["id"] for r in db.execute("SELECT id FROM branches ORDER BY id").fetchall()]
        users = [
            ("admin", generate_password_hash("admin123"), "admin", None),
            ("manager1", generate_password_hash("manager123"), "manager", b1),
            ("staff1", generate_password_hash("staff123"), "staff", b1),
        ]
        db.executemany("INSERT INTO users(username,password,role,branch_id) VALUES(?,?,?,?)", users)
        db.executemany("INSERT INTO vendors(name,contact,branch_id) VALUES(?,?,?)", [("Prime Supplies", "99999", b1), ("North Goods", "88888", b2)])
        db.executemany(
            "INSERT INTO customers(name,phone,email,branch_id) VALUES(?,?,?,?)",
            [("Alice", "7000000001", "alice@example.com", b1), ("Bob", "7000000002", "bob@example.com", b2)],
        )
        products = [
            ("SKU-101", "Milk", "Dairy", 35, 45, b1),
            ("SKU-102", "Bread", "Bakery", 20, 30, b1),
            ("SKU-201", "Rice", "Grain", 55, 75, b2),
        ]
        db.executemany(
            "INSERT INTO products(sku,name,category,cost_price,sell_price,branch_id) VALUES(?,?,?,?,?,?)",
            products,
        )
        for p in db.execute("SELECT id FROM products").fetchall():
            db.execute("INSERT INTO inventory(product_id,qty,reorder_level) VALUES(?,?,?)", (p["id"], 30, 10))
        db.commit()
        notify("info", "Seed data loaded")

    @app.route("/seed")
    def seed_route():
        seed_data()
        return "seeded"

    app.get_db = get_db
    app.init_db = init_db
    app.seed_data = seed_data
    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
