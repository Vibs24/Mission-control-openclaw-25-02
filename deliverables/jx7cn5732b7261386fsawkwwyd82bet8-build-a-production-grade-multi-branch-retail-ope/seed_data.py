from app import create_app
from app.models import db, User, Branch, Product, Inventory, Vendor, Customer, Purchase, Sale, Notification, AuditLog

app = create_app()
with app.app_context():
    db.drop_all(); db.create_all()
    b1 = Branch(name='Pune Central', city='Pune'); b2 = Branch(name='Mumbai South', city='Mumbai')
    p1 = Product(sku='SKU-001', name='Rice 5kg', cost_price=220, sell_price=265)
    p2 = Product(sku='SKU-002', name='Cooking Oil 1L', cost_price=110, sell_price=140)
    c1 = Customer(name='Aman Kale', phone='9990011223')
    v1 = Vendor(name='Fresh Suppliers', contact='fresh@example.com')
    db.session.add_all([b1,b2,p1,p2,c1,v1]); db.session.flush()
    admin = User(username='admin', role='Admin', branch_id=b1.id); admin.set_password('admin123')
    mgr = User(username='manager', role='Manager', branch_id=b1.id); mgr.set_password('manager123')
    stf = User(username='staff', role='Staff', branch_id=b2.id); stf.set_password('staff123')
    db.session.add_all([admin,mgr,stf])
    db.session.add_all([
        Inventory(branch_id=b1.id, product_id=p1.id, qty=50, reorder_level=10),
        Inventory(branch_id=b1.id, product_id=p2.id, qty=8, reorder_level=10),
        Inventory(branch_id=b2.id, product_id=p1.id, qty=15, reorder_level=7),
    ])
    db.session.add(Purchase(branch_id=b1.id, vendor_id=v1.id, product_id=p1.id, qty=20, unit_cost=220))
    db.session.add(Sale(branch_id=b1.id, customer_id=c1.id, product_id=p1.id, qty=3, unit_price=265))
    db.session.add(Notification(message='System initialized', level='info'))
    db.session.add(AuditLog(action='seed.init', detail='Initial seed completed'))
    db.session.commit()
    print('Seed complete: admin/admin123, manager/manager123, staff/staff123')
