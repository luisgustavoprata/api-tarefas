"""Uma pessoa nunca vê nem altera as tarefas de outra."""

import pytest


@pytest.fixture
def bruno(api):
    return api.headers("bruno@exemplo.com")


def test_each_user_lists_only_their_tasks(api, ana, bruno):
    api.create(ana, title="Da Ana", tags=["casa"])
    api.create(bruno, title="Do Bruno", tags=["casa"])

    titles = [t["title"] for t in api.client.get("/tasks", headers=ana).json()["items"]]
    assert titles == ["Da Ana"]
    assert api.client.get("/tags", headers=bruno).json() == [{"name": "casa", "tasks": 1}]
    assert api.client.get("/tasks/stats", headers=bruno).json()["total"] == 1


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_other_users_task_looks_like_it_does_not_exist(api, ana, bruno, method):
    task = api.create(ana)
    kwargs = {"json": {"title": "Invadido"}} if method == "patch" else {}
    response = getattr(api.client, method)(f"/tasks/{task['id']}", headers=bruno, **kwargs)
    assert response.status_code == 404

    still_there = api.client.get(f"/tasks/{task['id']}", headers=ana).json()
    assert still_there["title"] == "Tarefa de teste"


def test_same_tag_name_is_independent_per_user(api, ana, bruno):
    task = api.create(ana, tags=["trabalho"])
    api.create(bruno, tags=["trabalho"])
    api.client.delete(f"/tasks/{task['id']}", headers=ana)
    assert api.client.get("/tags", headers=bruno).json() == [{"name": "trabalho", "tasks": 1}]
