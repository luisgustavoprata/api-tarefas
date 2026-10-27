from app.security import create_access_token


def test_register_returns_the_account_without_password(api):
    response = api.register(email="  Ana@Exemplo.COM ")
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ana@exemplo.com"
    assert "password" not in body and "password_hash" not in body
    assert body["created_at"].endswith("Z") or "+00:00" in body["created_at"]


def test_duplicate_email_is_rejected(api):
    api.register()
    response = api.register(email="ANA@exemplo.com")
    assert response.status_code == 409
    assert response.json()["detail"] == "Já existe uma conta com este e-mail."


def test_register_validation_messages_in_portuguese(api):
    response = api.client.post(
        "/auth/register", json={"name": "A", "email": "sem-arroba", "password": "123"}
    )
    assert response.status_code == 422
    fields = {e["field"]: e["message"] for e in response.json()["errors"]}
    assert fields == {
        "name": "Deve ter pelo menos 2 caractere(s).",
        "email": "E-mail inválido.",
        "password": "Deve ter pelo menos 8 caractere(s).",
    }


def test_login_and_me(api):
    api.register()
    login = api.login()
    assert login.status_code == 200
    token = login.json()
    assert token["token_type"] == "bearer" and token["expires_in"] == 3600

    me = api.client.get("/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"})
    assert me.status_code == 200
    assert me.json()["name"] == "Ana Souza"


def test_wrong_password_and_unknown_email_give_the_same_answer(api):
    api.register()
    wrong = api.login(password="senha-errada")
    unknown = api.login(email="ninguem@exemplo.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "E-mail ou senha incorretos."}


def test_too_many_failed_logins_are_blocked(api):
    api.register()
    for _ in range(5):
        assert api.login(password="errada-errada").status_code == 401
    blocked = api.login()  # mesmo com a senha certa
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_protected_routes_need_a_valid_token(api, settings):
    assert api.client.get("/tasks").status_code == 401
    bad = {"Authorization": "Bearer token-falso"}
    assert api.client.get("/tasks", headers=bad).status_code == 401

    expired = create_access_token(1, settings.secret_key, minutes=-1)
    response = api.client.get("/tasks", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Token inválido ou expirado. Faça login novamente."


def test_token_signed_with_another_key_is_rejected(api):
    api.register()
    forged = create_access_token(1, "outra-chave-qualquer-com-32-bytes!!", minutes=10)
    response = api.client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401
