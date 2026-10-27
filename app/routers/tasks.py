from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.deps import CurrentUser, SessionDep, TodayDep
from app.models import Priority, TaskStatus
from app.schemas import ErrorResponse, Stats, TagOut, TaskCreate, TaskOut, TaskPage, TaskUpdate
from app.services import SortOption, TaskFilters, TaskNotFound, TaskService

NOT_FOUND = {404: {"model": ErrorResponse, "description": "Tarefa não encontrada."}}

router = APIRouter(
    tags=["Tarefas"],
    responses={
        401: {"model": ErrorResponse, "description": "Sem login ou token expirado."},
    },
)


def get_service(db: SessionDep, user: CurrentUser, today: TodayDep) -> TaskService:
    return TaskService(db, user, today)


Service = Annotated[TaskService, Depends(get_service)]


def _found(service: TaskService, task_id: int):
    try:
        return service.get(task_id)
    except TaskNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarefa não encontrada.") from None


@router.get("/tasks", response_model=TaskPage, summary="Lista as tarefas, com filtros")
def list_tasks(
    service: Service,
    status_: Annotated[
        list[TaskStatus] | None,
        Query(alias="status", description="Uma ou mais situações. Ex.: `?status=pendente`"),
    ] = None,
    priority: Annotated[list[Priority] | None, Query(description="Uma ou mais.")] = None,
    tag: Annotated[str | None, Query(max_length=30, description="Nome da etiqueta.")] = None,
    q: Annotated[
        str | None, Query(max_length=100, description="Busca no título e na descrição.")
    ] = None,
    due_from: Annotated[date | None, Query(description="Prazo a partir de (AAAA-MM-DD).")] = None,
    due_to: Annotated[date | None, Query(description="Prazo até (AAAA-MM-DD).")] = None,
    overdue: Annotated[
        bool | None, Query(description="`true`: só atrasadas. `false`: sem as atrasadas.")
    ] = None,
    sort: Annotated[
        SortOption, Query(description="Ordem. Use `-` para invertida, ex.: `-priority`.")
    ] = "-created_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TaskPage:
    filters = TaskFilters(
        status=status_,
        priority=priority,
        tag=tag,
        q=q,
        due_from=due_from,
        due_to=due_to,
        overdue=overdue,
    )
    items, total = service.list(filters, sort, limit, offset)
    return TaskPage(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/tasks",
    response_model=TaskOut,
    status_code=status.HTTP_201_CREATED,
    summary="Cria uma tarefa",
)
def create_task(data: TaskCreate, service: Service, response: Response) -> TaskOut:
    task = service.create(data)
    response.headers["Location"] = f"/tasks/{task.id}"
    return service.to_out(task)


@router.get("/tasks/stats", response_model=Stats, summary="Resumo das tarefas")
def task_stats(service: Service) -> dict:
    return service.stats()


@router.get("/tasks/{task_id}", response_model=TaskOut, responses=NOT_FOUND, summary="Uma tarefa")
def get_task(task_id: int, service: Service) -> TaskOut:
    return service.to_out(_found(service, task_id))


@router.patch(
    "/tasks/{task_id}",
    response_model=TaskOut,
    responses=NOT_FOUND,
    summary="Altera uma tarefa",
    description='Envie só os campos que mudam. Ex.: `{"status": "concluida"}`.',
)
def update_task(task_id: int, data: TaskUpdate, service: Service) -> TaskOut:
    _found(service, task_id)
    return service.to_out(service.update(task_id, data))


@router.delete(
    "/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Exclui uma tarefa",
)
def delete_task(task_id: int, service: Service) -> Response:
    _found(service, task_id)
    service.delete(task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tags", response_model=list[TagOut], summary="Etiquetas usadas, com contagem")
def list_tags(service: Service) -> list[TagOut]:
    return service.tags()
