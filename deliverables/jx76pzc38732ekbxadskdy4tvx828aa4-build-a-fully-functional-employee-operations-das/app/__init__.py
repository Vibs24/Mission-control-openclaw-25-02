from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from .models import db, User


def create_app(config_overrides=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY="change-me-in-production",
        SQLALCHEMY_DATABASE_URI="sqlite:///employee_ops.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if config_overrides:
        app.config.update(config_overrides)

    db.init_app(app)

    login_manager = LoginManager()
    login_manager.login_view = "login"
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    from .routes import register_routes

    register_routes(app)

    with app.app_context():
        db.create_all()

    return app
