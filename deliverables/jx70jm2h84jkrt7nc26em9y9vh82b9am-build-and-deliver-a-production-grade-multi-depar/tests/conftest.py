import tempfile
import pytest
from app import create_app

@pytest.fixture
def app():
    dbf=tempfile.NamedTemporaryFile(delete=False)
    app=create_app({'TESTING':True,'DATABASE':dbf.name,'SECRET_KEY':'test'})
    with app.app_context():
        app.init_db(); app.seed_data()
    yield app

@pytest.fixture
def client(app):
    return app.test_client()

def login(client,u,p):
    return client.post('/login',data={'username':u,'password':p},follow_redirects=True)
