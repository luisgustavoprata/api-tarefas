"""Filtros, busca, ordenação e paginação de GET /tasks."""

import pytest


@pytest.fixture
def tasks(api, ana):
    # "Hoje" nos testes é 07/01/2030.
    api.create(
        ana, title="Relatório mensal", priority="alta", due_date="2030-01-05", tags=["trabalho"]
    )
    api.create(
        ana,
        title="Reunião de equipe",
        priority="media",
        due_date="2030-01-07",
        status="em_andamento",
        tags=["trabalho", "reuniao"],
    )
    api.create(
        ana,
        title="Comprar café",
        priority="baixa",
        due_date="2030-01-20",
        description="Café 100% arábica",
        tags=["casa"],
    )
    api.create(ana, title="Ler livro", priority="media", status="concluida")
    api.create(
        ana,
        title="Pagar boleto",
        priority="alta",
        due_date="2030-01-02",
        status="concluida",
        tags=["casa"],
    )
    return ana


def titles(api, headers, query=""):
    response = api.client.get(f"/tasks{query}", headers=headers)
    assert response.status_code == 200, response.json()
    return [t["title"] for t in response.json()["items"]]


def test_default_order_is_newest_first(api, tasks):
    assert titles(api, tasks)[0] == "Pagar boleto"


def test_filter_by_one_or_more_status(api, tasks):
    assert set(titles(api, tasks, "?status=concluida")) == {"Ler livro", "Pagar boleto"}
    both = titles(api, tasks, "?status=pendente&status=em_andamento")
    assert set(both) == {"Relatório mensal", "Reunião de equipe", "Comprar café"}


def test_filter_by_priority_and_tag(api, tasks):
    assert set(titles(api, tasks, "?priority=alta")) == {"Relatório mensal", "Pagar boleto"}
    assert titles(api, tasks, "?tag=reuniao") == ["Reunião de equipe"]
    assert set(titles(api, tasks, "?tag=CASA")) == {"Comprar café", "Pagar boleto"}


def test_search_in_title_and_description(api, tasks):
    assert titles(api, tasks, "?q=reuni") == ["Reunião de equipe"]
    assert titles(api, tasks, "?q=arábica") == ["Comprar café"]


def test_search_treats_percent_literally(api, tasks):
    assert titles(api, tasks, "?q=100%25") == ["Comprar café"]  # %25 = "%"
    assert titles(api, tasks, "?q=%25%25") == []


def test_overdue_filter(api, tasks):
    assert titles(api, tasks, "?overdue=true") == ["Relatório mensal"]
    assert "Relatório mensal" not in titles(api, tasks, "?overdue=false")


def test_due_date_range(api, tasks):
    result = titles(api, tasks, "?due_from=2030-01-05&due_to=2030-01-07&sort=due_date")
    assert result == ["Relatório mensal", "Reunião de equipe"]


def test_sort_by_due_date_puts_tasks_without_due_date_last(api, tasks):
    result = titles(api, tasks, "?sort=due_date")
    assert result[0] == "Pagar boleto"
    assert result[-1] == "Ler livro"


def test_sort_by_priority(api, tasks):
    highest_first = titles(api, tasks, "?sort=-priority")
    assert set(highest_first[:2]) == {"Relatório mensal", "Pagar boleto"}
    assert highest_first[-1] == "Comprar café"


def test_combined_filters(api, tasks):
    assert titles(api, tasks, "?tag=trabalho&priority=media&status=em_andamento") == [
        "Reunião de equipe"
    ]


def test_pagination(api, tasks):
    first = api.client.get("/tasks?sort=title&limit=2", headers=tasks).json()
    second = api.client.get("/tasks?sort=title&limit=2&offset=2", headers=tasks).json()
    assert first["total"] == second["total"] == 5
    assert [t["title"] for t in first["items"]] == ["Comprar café", "Ler livro"]
    assert [t["title"] for t in second["items"]] == ["Pagar boleto", "Relatório mensal"]


@pytest.mark.parametrize(
    "query",
    ["?limit=0", "?limit=101", "?offset=-1", "?sort=cor", "?status=feito", "?overdue=talvez"],
)
def test_invalid_query_params(api, tasks, query):
    response = api.client.get(f"/tasks{query}", headers=tasks)
    assert response.status_code == 422
    assert response.json()["errors"]


def test_stats(api, tasks):
    stats = api.client.get("/tasks/stats", headers=tasks).json()
    assert stats == {
        "total": 5,
        "by_status": {"pendente": 2, "em_andamento": 1, "concluida": 2},
        "open_by_priority": {"baixa": 1, "media": 1, "alta": 1},
        "overdue": 1,
        "due_today": 1,
        "completion_rate": 0.4,
    }


def test_stats_for_a_new_account(api, ana):
    stats = api.client.get("/tasks/stats", headers=ana).json()
    assert stats["total"] == 0 and stats["completion_rate"] == 0.0


def test_tags_with_counts(api, tasks):
    assert api.client.get("/tags", headers=tasks).json() == [
        {"name": "casa", "tasks": 2},
        {"name": "reuniao", "tasks": 1},
        {"name": "trabalho", "tasks": 2},
    ]
