"""Cada teste ganha um banco limpo e uma "data de hoje" fixa.

Com TEST_DATABASE_URL definido (ex.: no CI), os testes rodam no PostgreSQL.
"""

import os
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, normalize_database_url
from app.database import Base
from app.deps import get_today
from app.main import create_app

TODAY = date(2030, 1, 7)  # segunda-feira
PASSWORD = "senha-forte-123"


@pytest.fixture
def settings(tmp_path) -> Settings:
    url = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 'test.db'}"
    return Settings(
        database_url=normalize_database_url(url),
        secret_key="chave-de-teste-com-pelo-menos-32-bytes!",
        password_iterations=1_000,  # rápido nos testes
    )


@pytest.fixture
def app(settings):
    application = create_app(settings)
    Base.metadata.drop_all(application.state.engine)  # PostgreSQL: começa do zero
    application.dependency_overrides[get_today] = lambda: TODAY
    return application


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


class Api:
    """Atalhos para os testes ficarem curtos e legíveis."""

    def __init__(self, client: TestClient):
        self.client = client

    def register(self, email="ana@exemplo.com", name="Ana Souza", password=PASSWORD):
        return self.client.post(
            "/auth/register", json={"name": name, "email": email, "password": password}
        )

    def login(self, email="ana@exemplo.com", password=PASSWORD):
        return self.client.post("/auth/token", data={"username": email, "password": password})

    def headers(self, email="ana@exemplo.com") -> dict:
        """Cria a conta (se preciso), entra e devolve o cabeçalho Authorization."""
        self.register(email=email)
        token = self.login(email=email).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def create(self, headers, **fields):
        payload = {"title": "Tarefa de teste", **fields}
        response = self.client.post("/tasks", json=payload, headers=headers)
        assert response.status_code == 201, response.json()
        return response.json()


@pytest.fixture
def api(client) -> Api:
    return Api(client)


@pytest.fixture
def ana(api) -> dict:
    return api.headers("ana@exemplo.com")
