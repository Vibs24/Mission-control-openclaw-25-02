from app import create_app
from app.models import db, Employee


def test_employee_model_unit():
    app = create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        e = Employee(name='T', email='t@x.com', department='Ops')
        db.session.add(e); db.session.commit()
        assert Employee.query.count() == 1
