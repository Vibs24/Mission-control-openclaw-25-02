import os
import tempfile

import pytest

from app import create_app


@pytest.fixture
def app():
    fd, db_path = tempfile.mkstemp(prefix="retailops-test-", suffix=".db")
    os.close(fd)

    app = create_app(
        {
            "TESTING": True,
            "DATABASE": db_path,
            "SECRET_KEY": "test-secret-key",
            "FORCE_PDF_FALLBACK": False,
        }
    )
    with app.app_context():
        app.init_db()
        app.seed_data()

    yield app

    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, username, password):
    return client.post(
        "/login",
        data={"username": username, "password": password},
        follow_redirects=True,
    )
