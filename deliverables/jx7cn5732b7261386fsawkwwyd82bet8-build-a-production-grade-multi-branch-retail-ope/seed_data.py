from app import create_app, db
from app.models import Branch, User, Vendor, Customer, Product, Inventory, Purchase, Sale, SaleItem, Notification

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    b1 = Branch(name='Downtown', city='Mumbai')
    b2 = Branch(name='Airport', city='Pune')
    db.session.add_all([b1, b2])
    db.session.flush()

    admin = User(username='admin', role='Admin', branch_id=b1.id)
    admin.set_password('admin123')
    manager = User(username='manager', role='Manager', branch_id=b1.id)
    manager.set_password('manager123')
    staff = User(username='staff', role='Staff', branch_id=b2.id)
    staff.set_password('staff123')
    db.session.add_all([admin, manager, staff])

    v1 = Vendor(name='Fresh Suppliers', email='vendor1@example.com')
    c1 = Customer(name='Walkin Prime', phone='9999999999')
    db.session.add_all([v1, c1])

    p1 = Product(sku='SKU100', name='Rice Bag 5kg', cost_price=220, sell_price=280)
    p2 = Product(sku='SKU200', name='Cooking Oil 1L', cost_price=90, sell_price=125)
    db.session.add_all([p1, p2])
    db.session.flush()

    i1 = Inventory(branch_id=b1.id, product_id=p1.id, qty=40, reorder_level=10)
    i2 = Inventory(branch_id=b1.id, product_id=p2.id, qty=8, reorder_level=10)
    db.session.add_all([i1, i2])

    db.session.add(Purchase(branch_id=b1.id, vendor_id=1, product_id=p1.id, qty=20, unit_cost=220))

    sale = Sale(branch_id=b1.id, customer_id=1, total_amount=560, total_cost=440)
    db.session.add(sale)
    db.session.flush()
    db.session.add(SaleItem(sale_id=sale.id, product_id=p1.id, qty=2, unit_price=280, unit_cost=220))

    db.session.add(Notification(level='warning', title='Low stock', message='Cooking Oil 1L low at Downtown'))

    db.session.commit()
    print('Seed complete: admin/manager/staff users + branches + inventory + transactions')
