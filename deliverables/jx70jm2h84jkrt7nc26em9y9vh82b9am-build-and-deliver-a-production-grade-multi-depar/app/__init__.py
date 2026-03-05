from flask import Flask
from flask_login import LoginManager
from .models import db, User


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY='workforce-secret-change-me',
        SQLALCHEMY_DATABASE_URI='sqlite:///workforce.db',
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if config:
        app.config.update(config)

    db.init_app(app)
    login = LoginManager(app)
    login.login_view = 'login'

    @login.user_loader
    def load(uid):
        return db.session.get(User, int(uid))

    from .routes import register_routes
    register_routes(app)

    with app.app_context():
        db.create_all()

    return app
