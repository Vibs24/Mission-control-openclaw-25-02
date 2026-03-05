from datetime import timedelta
from flask import Flask
from flask_login import LoginManager
from sqlalchemy import event
from sqlalchemy.engine import Engine
from .models import db, User


@event.listens_for(Engine, 'connect')
def set_sqlite_pragma(dbapi_connection, _):
    try:
        cur = dbapi_connection.cursor()
        cur.execute('PRAGMA foreign_keys=ON')
        cur.close()
    except Exception:
        pass


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY='pm-secret-change-me',
        SQLALCHEMY_DATABASE_URI='sqlite:///collab_pm.db',
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        REMEMBER_COOKIE_DURATION=timedelta(days=30),
    )
    if config:
        app.config.update(config)

    db.init_app(app)

    lm = LoginManager(app)
    lm.login_view = 'login'

    @lm.user_loader
    def load_user(uid):
        return db.session.get(User, int(uid))

    from .routes import register_routes
    register_routes(app)

    with app.app_context():
        db.create_all()

    return app
