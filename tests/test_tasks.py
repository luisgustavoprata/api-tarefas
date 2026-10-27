def test_create_with_defaults(api, ana):
    response = api.client.post("/tasks", json={"title": "  Comprar pão  "}, headers=ana)
    assert response.status_code == 201
    task = response.json()
    assert response.headers["Location"] == f"/tasks/{task['id']}"
    assert task["title"] == "Comprar pão"
    assert task["status"] == "pendente"
    assert task["priority"] == "media"
    assert task["tags"] == []
    assert task["overdue"] is False
    assert task["completed_at"] is None


def test_tags_are_normalized(api, ana):
    task = api.create(ana, tags=["Trabalho", " trabalho ", "URGENTE"])
    assert task["tags"] == ["trabalho", "urgente"]


def test_get_update_and_delete(api, ana):
    task = api.create(ana, title="Estudar", due_date="2030-01-10")

    got = api.client.get(f"/tasks/{task['id']}", headers=ana)
    assert got.status_code == 200 and got.json()["due_date"] == "2030-01-10"

    patched = api.client.patch(
        f"/tasks/{task['id']}", json={"priority": "alta", "description": "Cap. 3"}, headers=ana
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["priority"] == "alta"
    assert body["description"] == "Cap. 3"
    assert body["title"] == "Estudar"  # o que não foi enviado não muda

    assert api.client.delete(f"/tasks/{task['id']}", headers=ana).status_code == 204
    assert api.client.get(f"/tasks/{task['id']}", headers=ana).status_code == 404


def test_completing_sets_and_reopening_clears_completed_at(api, ana):
    task = api.create(ana)
    done = api.client.patch(f"/tasks/{task['id']}", json={"status": "concluida"}, headers=ana)
    assert done.json()["completed_at"] is not None

    reopened = api.client.patch(f"/tasks/{task['id']}", json={"status": "pendente"}, headers=ana)
    assert reopened.json()["completed_at"] is None


def test_created_already_done_has_completed_at(api, ana):
    assert api.create(ana, status="concluida")["completed_at"] is not None


def test_overdue_flag(api, ana):
    # "Hoje" nos testes é 07/01/2030.
    late = api.create(ana, due_date="2030-01-06")
    today = api.create(ana, due_date="2030-01-07")
    late_but_done = api.create(ana, due_date="2030-01-01", status="concluida")
    assert late["overdue"] is True
    assert today["overdue"] is False
    assert late_but_done["overdue"] is False


def test_patch_rejects_nulls_and_empty_body(api, ana):
    task = api.create(ana)
    url = f"/tasks/{task['id']}"

    null_title = api.client.patch(url, json={"title": None}, headers=ana)
    assert null_title.status_code == 422
    assert "não pode ser nulo" in null_title.json()["errors"][0]["message"]

    empty = api.client.patch(url, json={}, headers=ana)
    assert empty.status_code == 422
    assert empty.json()["errors"][0]["message"] == "Envie pelo menos um campo para alterar."

    # Prazo e descrição podem ser apagados com null.
    cleared = api.client.patch(url, json={"due_date": None, "description": None}, headers=ana)
    assert cleared.status_code == 200


def test_replacing_tags_removes_unused_ones(api, ana):
    task = api.create(ana, tags=["casa", "urgente"])
    api.create(ana, tags=["casa"])

    api.client.patch(f"/tasks/{task['id']}", json={"tags": ["casa"]}, headers=ana)
    tags = api.client.get("/tags", headers=ana).json()
    assert tags == [{"name": "casa", "tasks": 2}]


def test_validation_errors(api, ana):
    response = api.client.post(
        "/tasks",
        json={"title": "", "priority": "urgentissima", "due_date": "31/12/2030", "cor": "azul"},
        headers=ana,
    )
    assert response.status_code == 422
    errors = {e["field"]: e["message"] for e in response.json()["errors"]}
    assert errors["title"] == "Não pode ficar vazio."
    assert errors["priority"] == "Valor inválido. Use: 'baixa', 'media' or 'alta'."
    assert errors["due_date"] == "Data inválida. Use AAAA-MM-DD."
    assert errors["cor"] == "Campo não permitido."


def test_unknown_task_is_404(api, ana):
    response = api.client.get("/tasks/999", headers=ana)
    assert response.status_code == 404
    assert response.json() == {"detail": "Tarefa não encontrada."}


def test_tasks_are_deleted_with_the_tags_link(api, ana):
    task = api.create(ana, tags=["temporaria"])
    api.client.delete(f"/tasks/{task['id']}", headers=ana)
    assert api.client.get("/tags", headers=ana).json() == []
