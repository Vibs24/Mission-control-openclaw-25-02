import os
import sys
import tempfile
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app, db
from app.models import Branch, User, Product, Inventory, Vendor, Customer


@pytest.fixture
def client():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}',
        'SECRET_KEY': 'test-secret',
    })

    with app.app_context():
        db.create_all()
        branch = Branch(name='Test Branch', city='Test City')
        db.session.add(branch)
        db.session.flush()

        admin = User(username='admin', role='Admin', branch_id=branch.id)
        admin.set_password('admin123')
        manager = User(username='manager', role='Manager', branch_id=branch.id)
        manager.set_password('manager123')
        staff = User(username='staff', role='Staff', branch_id=branch.id)
        staff.set_password('staff123')
        db.session.add_all([admin, manager, staff])

        p = Product(sku='TSKU', name='Test Product', cost_price=10, sell_price=20)
        v = Vendor(name='Vendor A', email='v@example.com')
        c = Customer(name='Customer A', phone='111')
        db.session.add_all([p, v, c])
        db.session.flush()
        db.session.add(Inventory(branch_id=branch.id, product_id=p.id, qty=15, reorder_level=5))
        db.session.commit()

    with app.test_client() as client:
        yield client

    os.close(db_fd)
    os.unlink(db_path)


def login(client, username='admin', password='admin123'):
    return client.post('/login', data={'username': username, 'password': password}, follow_redirects=True)
