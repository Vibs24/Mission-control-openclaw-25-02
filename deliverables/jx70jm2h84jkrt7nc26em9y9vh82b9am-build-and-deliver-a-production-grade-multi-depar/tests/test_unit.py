from app import app, db, Department, Employee

def test_employee_model_insert():
    with app.app_context():
        db.session.add(Department(name='Ops')); db.session.commit()
        dep=Department.query.filter_by(name='Ops').first()
        db.session.add(Employee(name='Unit',email='unit@test.com',department_id=dep.id)); db.session.commit()
        assert Employee.query.filter_by(email='unit@test.com').count()==1
