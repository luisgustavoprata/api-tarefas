from fastapi.testclient import TestClient

from app.config import Settings, normalize_database_url
from app.main import create_app
from app.seed import DEMO_EMAIL, DEMO_PASSWORD


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "version": "1.3.0"}


def test_home_serves_the_web_interface(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/docs").status_code == 200


def test_openapi_documents_every_route(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) == {
        "/auth/register",
        "/auth/token",
        "/auth/me",
        "/tasks",
        "/tasks/stats",
        "/tasks/{task_id}",
        "/tags",
        "/health",
    }


def test_demo_account_is_created_once(settings):
    demo_settings = Settings(**{**settings.__dict__, "seed_demo": True})
    for _ in range(2):  # reiniciar o servidor não duplica nada
        app = create_app(demo_settings)
        with TestClient(app) as client:
            login = client.post(
                "/auth/token", data={"username": DEMO_EMAIL, "password": DEMO_PASSWORD}
            )
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            stats = client.get("/tasks/stats", headers=headers).json()
            assert stats["total"] == 9


def test_database_url_normalization():
    assert normalize_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_database_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_database_url("sqlite:///x.db") == "sqlite:///x.db"


def test_production_requires_a_secret_key(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    try:
        Settings.from_env()
    except RuntimeError as exc:
        assert "SECRET_KEY" in str(exc)
    else:
        raise AssertionError("deveria exigir SECRET_KEY em produção")
