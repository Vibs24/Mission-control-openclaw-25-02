from flask import Flask
from flask_login import LoginManager
from .models import db, User

def create_app(config=None):
    app = Flask(__name__)
    app.config.update(SECRET_KEY='team-secret',SQLALCHEMY_DATABASE_URI='sqlite:///teamflow.db',SQLALCHEMY_TRACK_MODIFICATIONS=False,REMEMBER_COOKIE_DURATION=604800)
    if config: app.config.update(config)
    db.init_app(app)
    login=LoginManager(app); login.login_view='login'
    @login.user_loader
    def load_user(uid): return db.session.get(User,int(uid))
    from .routes import register_routes
    register_routes(app)
    with app.app_context(): db.create_all()
    return app
