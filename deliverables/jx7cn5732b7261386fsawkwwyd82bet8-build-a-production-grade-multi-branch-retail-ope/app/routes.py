import csv
from io import StringIO, BytesIO
from datetime import date
from functools import wraps
from flask import Blueprint, render_template, request, redirect, url_for, flash, Response, abort
from flask_login import login_user, logout_user, login_required, current_user
from fpdf import FPDF
from . import db
from .models import (
    AuditLog, Notification, Branch, User, Vendor, Customer,
    Product, Inventory, Purchase, Sale, SaleItem
)

bp = Blueprint('main', __name__)


def log(action, entity, detail):
    db.session.add(AuditLog(actor=current_user.username if current_user.is_authenticated else 'system', action=action, entity=entity, detail=detail))


def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if current_user.role not in roles:
                abort(403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def paginate(query, default=10):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', default, type=int)
    return query.paginate(page=page, per_page=per_page, error_out=False)


@bp.route('/')
def root():
    return redirect(url_for('main.dashboard') if current_user.is_authenticated else url_for('main.login'))


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username'].strip()).first()
        if user and user.check_password(request.form['password']):
            login_user(user)
            log('login', 'auth', f'{user.username} logged in')
            db.session.commit()
            return redirect(url_for('main.dashboard'))
        flash('Invalid credentials', 'danger')
    return render_template('login.html')


@bp.route('/logout')
@login_required
def logout():
    log('logout', 'auth', f'{current_user.username} logged out')
    db.session.commit()
    logout_user()
    return redirect(url_for('main.login'))


@bp.route('/dashboard')
@login_required
def dashboard():
    today = date.today()
    daily_sales = db.session.query(db.func.coalesce(db.func.sum(Sale.total_amount), 0)).filter(Sale.sold_on == today).scalar() or 0
    daily_cost = db.session.query(db.func.coalesce(db.func.sum(Sale.total_cost), 0)).filter(Sale.sold_on == today).scalar() or 0
    margin = daily_sales - daily_cost
    sold_qty = db.session.query(db.func.coalesce(db.func.sum(SaleItem.qty), 0)).scalar() or 0
    on_hand = db.session.query(db.func.coalesce(db.func.sum(Inventory.qty), 0)).scalar() or 1
    turnover = round(sold_qty / on_hand, 3) if on_hand else 0
    low_stock_count = Inventory.query.filter(Inventory.qty <= Inventory.reorder_level).count()
    notifications = Notification.query.order_by(Notification.created_at.desc()).limit(10).all()
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(12).all()
    return render_template('dashboard.html', daily_sales=daily_sales, margin=margin, turnover=turnover, low_stock_count=low_stock_count, notifications=notifications, logs=logs)


@bp.route('/branches', methods=['GET', 'POST'])
@login_required
@role_required('Admin')
def branches():
    if request.method == 'POST':
        b = Branch(name=request.form['name'], city=request.form['city'])
        db.session.add(b)
        db.session.flush()
        log('create', 'branch', f'Created {b.name}')
        db.session.commit()
        return redirect(url_for('main.branches'))
    pagination = paginate(Branch.query.order_by(Branch.name.asc()))
    return render_template('branches.html', pagination=pagination)


@bp.route('/catalog', methods=['GET', 'POST'])
@login_required
@role_required('Admin', 'Manager')
def catalog():
    if request.method == 'POST':
        p = Product(
            sku=request.form['sku'],
            name=request.form['name'],
            cost_price=float(request.form['cost_price']),
            sell_price=float(request.form['sell_price']),
        )
        db.session.add(p)
        db.session.flush()
        log('create', 'product', f'Created {p.sku}')
        db.session.commit()
        return redirect(url_for('main.catalog'))
    q = request.args.get('q', '').strip()
    query = Product.query
    if q:
        query = query.filter(Product.name.contains(q) | Product.sku.contains(q))
    pagination = paginate(query.order_by(Product.name.asc()))
    return render_template('catalog.html', pagination=pagination, q=q)


@bp.route('/inventory', methods=['GET', 'POST'])
@login_required
def inventory():
    if request.method == 'POST':
        inv = Inventory(
            branch_id=int(request.form['branch_id']),
            product_id=int(request.form['product_id']),
            qty=int(request.form['qty']),
            reorder_level=int(request.form['reorder_level']),
        )
        db.session.add(inv)
        db.session.flush()
        if inv.qty <= inv.reorder_level:
            db.session.add(Notification(level='warning', title='Low stock', message=f'{inv.product.name} low at {inv.branch.name}'))
        log('create', 'inventory', f'{inv.product_id}@{inv.branch_id}')
        db.session.commit()
        return redirect(url_for('main.inventory'))

    branch_id = request.args.get('branch_id', type=int)
    query = Inventory.query
    if branch_id:
        query = query.filter_by(branch_id=branch_id)
    pagination = paginate(query.order_by(Inventory.id.desc()))
    return render_template('inventory.html', pagination=pagination, branches=Branch.query.order_by(Branch.name).all(), products=Product.query.order_by(Product.name).all(), selected_branch=branch_id)


@bp.route('/vendors', methods=['GET', 'POST'])
@login_required
def vendors():
    if request.method == 'POST':
        v = Vendor(name=request.form['name'], email=request.form.get('email'))
        db.session.add(v)
        db.session.flush()
        log('create', 'vendor', f'{v.name}')
        db.session.commit()
        return redirect(url_for('main.vendors'))
    pagination = paginate(Vendor.query.order_by(Vendor.name))
    return render_template('vendors.html', pagination=pagination)


@bp.route('/customers', methods=['GET', 'POST'])
@login_required
def customers():
    if request.method == 'POST':
        c = Customer(name=request.form['name'], phone=request.form.get('phone'))
        db.session.add(c)
        db.session.flush()
        log('create', 'customer', c.name)
        db.session.commit()
        return redirect(url_for('main.customers'))
    pagination = paginate(Customer.query.order_by(Customer.name))
    return render_template('customers.html', pagination=pagination)


@bp.route('/purchases', methods=['GET', 'POST'])
@login_required
@role_required('Admin', 'Manager')
def purchases():
    if request.method == 'POST':
        purchase = Purchase(
            branch_id=int(request.form['branch_id']),
            vendor_id=int(request.form['vendor_id']),
            product_id=int(request.form['product_id']),
            qty=int(request.form['qty']),
            unit_cost=float(request.form['unit_cost']),
        )
        db.session.add(purchase)
        inv = Inventory.query.filter_by(branch_id=purchase.branch_id, product_id=purchase.product_id).first()
        if not inv:
            inv = Inventory(branch_id=purchase.branch_id, product_id=purchase.product_id, qty=0, reorder_level=5)
            db.session.add(inv)
        inv.qty += purchase.qty
        log('create', 'purchase', f'Purchase {purchase.product_id} x {purchase.qty}')
        db.session.commit()
        return redirect(url_for('main.purchases'))

    pagination = paginate(Purchase.query.order_by(Purchase.id.desc()))
    return render_template('purchases.html', pagination=pagination, branches=Branch.query.all(), vendors=Vendor.query.all(), products=Product.query.all())


@bp.route('/sales', methods=['GET', 'POST'])
@login_required
def sales():
    if request.method == 'POST':
        branch_id = int(request.form['branch_id'])
        product_id = int(request.form['product_id'])
        qty = int(request.form['qty'])
        customer_id = request.form.get('customer_id', type=int)

        inv = Inventory.query.filter_by(branch_id=branch_id, product_id=product_id).first()
        if not inv or inv.qty < qty:
            flash('Insufficient stock', 'danger')
            return redirect(url_for('main.sales'))

        product = Product.query.get_or_404(product_id)
        sale = Sale(branch_id=branch_id, customer_id=customer_id, total_amount=qty * product.sell_price, total_cost=qty * product.cost_price)
        db.session.add(sale)
        db.session.flush()
        db.session.add(SaleItem(sale_id=sale.id, product_id=product_id, qty=qty, unit_price=product.sell_price, unit_cost=product.cost_price))
        inv.qty -= qty
        if inv.qty <= inv.reorder_level:
            db.session.add(Notification(level='warning', title='Low stock', message=f'{product.name} low at {inv.branch.name}'))
        log('create', 'sale', f'Sale #{sale.id}')
        db.session.commit()
        return redirect(url_for('main.sales'))

    pagination = paginate(Sale.query.order_by(Sale.id.desc()))
    return render_template('sales.html', pagination=pagination, branches=Branch.query.all(), customers=Customer.query.all(), products=Product.query.all())


@bp.route('/invoice/<int:sale_id>.pdf')
@login_required
def invoice(sale_id):
    sale = Sale.query.get_or_404(sale_id)
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Arial', 'B', 14)
    pdf.cell(0, 10, f'Invoice #{sale.id}', ln=True)
    pdf.set_font('Arial', '', 11)
    pdf.cell(0, 8, f'Branch: {sale.branch.name}', ln=True)
    pdf.cell(0, 8, f'Date: {sale.sold_on}', ln=True)
    pdf.cell(0, 8, f'Customer: {sale.customer.name if sale.customer else "Walk-in"}', ln=True)
    pdf.ln(4)
    for item in sale.items:
        pdf.cell(0, 8, f'{item.product.name} x {item.qty} @ {item.unit_price}', ln=True)
    pdf.ln(4)
    pdf.cell(0, 8, f'Total: {sale.total_amount:.2f}', ln=True)
    raw = bytes(pdf.output(dest='S'))
    return Response(raw, mimetype='application/pdf', headers={'Content-Disposition': f'attachment; filename=invoice_{sale.id}.pdf'})


@bp.route('/export/<string:name>.csv')
@login_required
def export_csv(name):
    out = StringIO()
    w = csv.writer(out)
    if name == 'inventory':
        w.writerow(['Branch', 'SKU', 'Product', 'Qty', 'Reorder'])
        for i in Inventory.query.all():
            w.writerow([i.branch.name, i.product.sku, i.product.name, i.qty, i.reorder_level])
    elif name == 'sales':
        w.writerow(['ID', 'Branch', 'Customer', 'Total', 'Cost', 'Date'])
        for s in Sale.query.all():
            w.writerow([s.id, s.branch.name, s.customer.name if s.customer else 'Walk-in', s.total_amount, s.total_cost, s.sold_on])
    else:
        return 'Unsupported export', 400
    return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition': f'attachment; filename={name}.csv'})


@bp.route('/notifications')
@login_required
def notifications():
    pagination = paginate(Notification.query.order_by(Notification.created_at.desc()))
    return render_template('notifications.html', pagination=pagination)


@bp.route('/audit')
@login_required
def audit():
    pagination = paginate(AuditLog.query.order_by(AuditLog.created_at.desc()))
    return render_template('audit.html', pagination=pagination)
