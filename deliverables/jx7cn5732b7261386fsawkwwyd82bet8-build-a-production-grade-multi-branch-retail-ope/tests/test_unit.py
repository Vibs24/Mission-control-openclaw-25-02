from app import create_app
from app.models import db, Product


def test_margin_math_unit():
    app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        p = Product(sku='X', name='X', cost_price=10, sell_price=15)
        db.session.add(p); db.session.commit()
        assert (p.sell_price - p.cost_price) == 5
