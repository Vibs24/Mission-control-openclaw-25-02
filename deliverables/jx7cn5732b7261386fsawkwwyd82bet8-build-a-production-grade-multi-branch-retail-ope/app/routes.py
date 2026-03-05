import csv
from io import StringIO, BytesIO
from datetime import date
from functools import wraps
from flask import render_template, request, redirect, url_for, flash, abort, Response, send_file
from flask_login import login_user, logout_user, login_required, current_user
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from .models import db, User, Branch, Product, Inventory, Vendor, Customer, Purchase, Sale, Notification, AuditLog


def register_routes(app):
    def audit(action, detail):
        db.session.add(AuditLog(action=action, detail=detail))

    def roles_allowed(*roles):
        def deco(fn):
            @wraps(fn)
            def wrap(*a, **k):
                if current_user.role not in roles:
                    abort(403)
                return fn(*a, **k)
            return wrap
        return deco

    def paginate(query):
        page = request.args.get('page', 1, type=int)
        pp = request.args.get('per_page', 10, type=int)
        return query.paginate(page=page, per_page=pp, error_out=False)

    @app.route('/')
    def root():
        return redirect(url_for('dashboard') if current_user.is_authenticated else url_for('login'))

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if request.method == 'POST':
            u = User.query.filter_by(username=request.form['username'].strip()).first()
            if u and u.check_password(request.form['password']):
                login_user(u)
                audit('auth.login', u.username)
                db.session.commit()
                return redirect(url_for('dashboard'))
            flash('Invalid credentials', 'danger')
        return render_template('login.html')

    @app.route('/logout')
    @login_required
    def logout():
        audit('auth.logout', current_user.username)
        db.session.commit()
        logout_user()
        return redirect(url_for('login'))

    @app.route('/dashboard')
    @login_required
    def dashboard():
        today = date.today()
        sales_today = Sale.query.filter(db.func.date(Sale.created_at) == today).all()
        revenue = sum(x.qty * x.unit_price for x in sales_today)
        cogs = 0
        for s in sales_today:
            p = db.session.get(Product, s.product_id)
            cogs += s.qty * p.cost_price
        margin = revenue - cogs
        total_stock = sum(x.qty for x in Inventory.query.all()) or 1
        sold_qty = sum(x.qty for x in sales_today)
        stock_turnover = round(sold_qty / total_stock, 2)
        low = Inventory.query.filter(Inventory.qty <= Inventory.reorder_level).all()
        for l in low[:2]:
            db.session.add(Notification(message=f'Low stock: {l.product.name} @ {l.branch.name}', level='warning'))
        db.session.commit()
        return render_template('dashboard.html', kpi={
            'daily_sales': round(revenue, 2),
            'margin': round(margin, 2),
            'stock_turnover': stock_turnover,
            'low_stock_count': len(low)
        }, low=low)

    @app.route('/branches', methods=['GET', 'POST'])
    @login_required
    @roles_allowed('Admin')
    def branches():
        if request.method == 'POST':
            b = Branch(name=request.form['name'], city=request.form['city'])
            db.session.add(b); audit('branch.create', b.name); db.session.commit()
            return redirect(url_for('branches'))
        return render_template('branches.html', rows=paginate(Branch.query.order_by(Branch.id.desc())))

    @app.route('/master', methods=['GET', 'POST'])
    @login_required
    @roles_allowed('Admin', 'Manager')
    def master():
        if request.method == 'POST':
            kind = request.form['kind']
            if kind == 'product':
                row = Product(sku=request.form['sku'], name=request.form['name'], cost_price=float(request.form['cost_price']), sell_price=float(request.form['sell_price']))
            elif kind == 'customer':
                row = Customer(name=request.form['name'], phone=request.form['phone'])
            else:
                row = Vendor(name=request.form['name'], contact=request.form['phone'])
            db.session.add(row); audit(f'{kind}.create', getattr(row, 'name', '')) ; db.session.commit()
            return redirect(url_for('master'))
        return render_template('master.html', products=Product.query.all(), customers=Customer.query.all(), vendors=Vendor.query.all())

    @app.route('/inventory', methods=['GET', 'POST'])
    @login_required
    @roles_allowed('Admin', 'Manager', 'Staff')
    def inventory():
        if request.method == 'POST':
            inv = Inventory.query.filter_by(branch_id=int(request.form['branch_id']), product_id=int(request.form['product_id'])).first()
            if not inv:
                inv = Inventory(branch_id=int(request.form['branch_id']), product_id=int(request.form['product_id']), qty=int(request.form['qty']), reorder_level=int(request.form.get('reorder_level', 10)))
                db.session.add(inv)
            else:
                inv.qty = int(request.form['qty'])
            audit('inventory.upsert', f'branch={inv.branch_id},product={inv.product_id},qty={inv.qty}')
            db.session.commit()
            return redirect(url_for('inventory'))
        q = request.args.get('q', '').strip()
        query = Inventory.query
        if q:
            query = query.join(Product).filter(Product.name.ilike(f'%{q}%'))
        return render_template('inventory.html', rows=paginate(query), branches=Branch.query.all(), products=Product.query.all(), q=q)

    @app.route('/purchase', methods=['GET', 'POST'])
    @login_required
    @roles_allowed('Admin', 'Manager')
    def purchase():
        if request.method == 'POST':
            r = Purchase(branch_id=int(request.form['branch_id']), vendor_id=int(request.form['vendor_id']), product_id=int(request.form['product_id']), qty=int(request.form['qty']), unit_cost=float(request.form['unit_cost']))
            db.session.add(r)
            inv = Inventory.query.filter_by(branch_id=r.branch_id, product_id=r.product_id).first()
            if not inv:
                inv = Inventory(branch_id=r.branch_id, product_id=r.product_id, qty=0)
                db.session.add(inv)
            inv.qty += r.qty
            audit('purchase.create', f'id={r.id}')
            db.session.commit()
            return redirect(url_for('purchase'))
        return render_template('purchase.html', rows=paginate(Purchase.query.order_by(Purchase.id.desc())), branches=Branch.query.all(), products=Product.query.all(), vendors=Vendor.query.all())

    @app.route('/sales', methods=['GET', 'POST'])
    @login_required
    @roles_allowed('Admin', 'Manager', 'Staff')
    def sales():
        if request.method == 'POST':
            r = Sale(branch_id=int(request.form['branch_id']), customer_id=int(request.form['customer_id']), product_id=int(request.form['product_id']), qty=int(request.form['qty']), unit_price=float(request.form['unit_price']))
            inv = Inventory.query.filter_by(branch_id=r.branch_id, product_id=r.product_id).first()
            if not inv or inv.qty < r.qty:
                flash('Insufficient stock', 'danger'); return redirect(url_for('sales'))
            inv.qty -= r.qty
            db.session.add(r)
            audit('sale.create', f'id={r.id}')
            db.session.commit()
            return redirect(url_for('invoice', sale_id=r.id))
        return render_template('sales.html', rows=paginate(Sale.query.order_by(Sale.id.desc())), branches=Branch.query.all(), products=Product.query.all(), customers=Customer.query.all())

    @app.route('/invoice/<int:sale_id>')
    @login_required
    def invoice(sale_id):
        sale = db.session.get(Sale, sale_id)
        if not sale: abort(404)
        branch = db.session.get(Branch, sale.branch_id)
        product = db.session.get(Product, sale.product_id)
        customer = db.session.get(Customer, sale.customer_id) if sale.customer_id else None
        return render_template('invoice.html', sale=sale, branch=branch, product=product, customer=customer, total=sale.qty*sale.unit_price)

    @app.route('/export/<string:kind>.csv')
    @login_required
    def export_csv(kind):
        sio, w = StringIO(), csv.writer(StringIO())
        out = StringIO(); writer = csv.writer(out)
        if kind == 'sales':
            writer.writerow(['id','branch_id','product_id','qty','unit_price','created_at'])
            [writer.writerow([x.id,x.branch_id,x.product_id,x.qty,x.unit_price,x.created_at]) for x in Sale.query.all()]
        elif kind == 'inventory':
            writer.writerow(['id','branch','product','qty','reorder_level'])
            [writer.writerow([x.id,x.branch.name,x.product.name,x.qty,x.reorder_level]) for x in Inventory.query.all()]
        else:
            return 'unknown', 404
        return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition': f'attachment; filename={kind}.csv'})

    @app.route('/export/invoice/<int:sale_id>.pdf')
    @login_required
    def export_invoice_pdf(sale_id):
        sale = db.session.get(Sale, sale_id)
        if not sale: abort(404)
        p = db.session.get(Product, sale.product_id)
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        c.drawString(50, 800, f'Invoice #{sale.id}')
        c.drawString(50, 780, f'Product: {p.name}')
        c.drawString(50, 760, f'Qty: {sale.qty} Unit: {sale.unit_price}')
        c.drawString(50, 740, f'Total: {sale.qty * sale.unit_price}')
        c.save(); buffer.seek(0)
        return send_file(buffer, mimetype='application/pdf', as_attachment=True, download_name=f'invoice_{sale.id}.pdf')

    @app.route('/notifications')
    @login_required
    def notifications():
        return render_template('notifications.html', rows=paginate(Notification.query.order_by(Notification.id.desc())))

    @app.route('/audit')
    @login_required
    @roles_allowed('Admin','Manager')
    def audit_view():
        return render_template('audit.html', rows=paginate(AuditLog.query.order_by(AuditLog.id.desc())))
