from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = 'change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///employee_notes.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    notes = db.relationship('Note', backref='employee', cascade='all, delete-orphan', lazy=True)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)

@login_manager.user_loader
def load_user(uid):
    return db.session.get(User, int(uid))

@app.route('/')
def index():
    return redirect(url_for('dashboard') if current_user.is_authenticated else url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username']).first()
        if user and check_password_hash(user.password_hash, request.form['password']):
            login_user(user)
            return redirect(url_for('dashboard'))
        flash('Invalid credentials')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    employees = Employee.query.order_by(Employee.id.desc()).all()
    return render_template('dashboard.html', employees=employees)

@app.route('/employees', methods=['POST'])
@login_required
def create_employee():
    e = Employee(name=request.form['name'], email=request.form['email'])
    db.session.add(e)
    db.session.commit()
    return redirect(url_for('dashboard'))

@app.route('/employees/<int:employee_id>/delete', methods=['POST'])
@login_required
def delete_employee(employee_id):
    employee = Employee.query.get_or_404(employee_id)
    db.session.delete(employee)
    db.session.commit()
    return redirect(url_for('dashboard'))

@app.route('/employees/<int:employee_id>/notes', methods=['POST'])
@login_required
def add_note(employee_id):
    employee = Employee.query.get_or_404(employee_id)
    note = Note(content=request.form['content'], employee_id=employee.id)
    db.session.add(note)
    db.session.commit()
    return redirect(url_for('dashboard'))

@app.route('/notes/<int:note_id>/delete', methods=['POST'])
@login_required
def delete_note(note_id):
    note = Note.query.get_or_404(note_id)
    db.session.delete(note)
    db.session.commit()
    return redirect(url_for('dashboard'))

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
