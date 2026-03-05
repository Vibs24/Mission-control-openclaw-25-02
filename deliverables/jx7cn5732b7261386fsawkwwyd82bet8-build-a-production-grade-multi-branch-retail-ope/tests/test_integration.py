from app import create_app
from app.models import db, User, Branch, Product, Customer, Inventory


def setup_client():
    app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        b=Branch(name='B1', city='Pune'); p=Product(sku='S1', name='Prod', cost_price=10, sell_price=20); c=Customer(name='Cust')
        db.session.add_all([b,p,c]); db.session.flush()
        u=User(username='admin', role='Admin', branch_id=b.id); u.set_password('admin123'); db.session.add(u)
        db.session.add(Inventory(branch_id=b.id, product_id=p.id, qty=10, reorder_level=2))
        db.session.commit()
    return app.test_client(), app


def login(client):
    return client.post('/login', data={'username':'admin','password':'admin123'}, follow_redirects=True)


def test_sales_reduces_inventory():
    client, app = setup_client(); login(client)
    r = client.post('/sales', data={'branch_id':1,'customer_id':1,'product_id':1,'qty':2,'unit_price':20}, follow_redirects=False)
    assert r.status_code in (302, 303)
    with app.app_context():
        inv = Inventory.query.first()
        assert inv.qty == 8
