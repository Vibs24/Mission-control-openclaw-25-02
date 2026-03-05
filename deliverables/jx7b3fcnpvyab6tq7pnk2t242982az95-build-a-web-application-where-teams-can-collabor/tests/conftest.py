import os, sys, tempfile
import pytest
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
if ROOT not in sys.path: sys.path.insert(0, ROOT)
from app import create_app

@pytest.fixture
def client():
    fd, path = tempfile.mkstemp()
    app = create_app({'TESTING': True, 'DATABASE': path, 'SECRET_KEY':'t'})
    app.init_db()
    with app.test_client() as c:
        yield c
    os.close(fd)
