"""Regras de negócio das tarefas. As rotas só recebem a requisição e chamam este serviço.

Toda consulta é filtrada pelo dono: um usuário nunca vê nem altera tarefas de outro
(para ele, elas "não existem" e a resposta é 404).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy import Select, case, delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import Priority, Tag, Task, TaskStatus, User, task_tags, utc_now
from app.schemas import TagOut, TaskCreate, TaskOut, TaskUpdate

SortOption = Literal[
    "created_at", "-created_at", "due_date", "-due_date", "priority", "-priority", "title"
]

PRIORITY_RANK = case(
    (Task.priority == Priority.LOW, 1),
    (Task.priority == Priority.MEDIUM, 2),
    (Task.priority == Priority.HIGH, 3),
)

SORTS = {
    "created_at": [Task.created_at.asc()],
    "-created_at": [Task.created_at.desc()],
    "due_date": [Task.due_date.asc().nulls_last()],
    "-due_date": [Task.due_date.desc().nulls_last()],
    "priority": [PRIORITY_RANK.asc()],
    "-priority": [PRIORITY_RANK.desc()],
    "title": [func.lower(Task.title).asc()],
}


class TaskNotFound(Exception):
    pass


@dataclass
class TaskFilters:
    status: list[TaskStatus] | None = None
    priority: list[Priority] | None = None
    tag: str | None = None
    q: str | None = None
    due_from: date | None = None
    due_to: date | None = None
    overdue: bool | None = None


class TaskService:
    def __init__(self, db: Session, user: User, today: date):
        self.db = db
        self.user = user
        self.today = today

    # ----- leitura -----

    def to_out(self, task: Task) -> TaskOut:
        return TaskOut(
            id=task.id,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
            tags=[t.name for t in task.tags],
            overdue=task.is_overdue(self.today),
            created_at=task.created_at,
            updated_at=task.updated_at,
            completed_at=task.completed_at,
        )

    def _overdue_condition(self):
        return (
            Task.due_date.is_not(None)
            & (Task.due_date < self.today)
            & (Task.status != TaskStatus.DONE)
        )

    def _filtered(self, f: TaskFilters) -> Select:
        query = select(Task).where(Task.user_id == self.user.id)
        if f.status:
            query = query.where(Task.status.in_(f.status))
        if f.priority:
            query = query.where(Task.priority.in_(f.priority))
        if f.tag:
            query = query.where(Task.tags.any(Tag.name == f.tag.strip().lower()))
        if f.q:
            # autoescape: "%" e "_" digitados pela pessoa são buscados literalmente.
            query = query.where(
                or_(
                    Task.title.icontains(f.q, autoescape=True),
                    Task.description.icontains(f.q, autoescape=True),
                )
            )
        if f.due_from:
            query = query.where(Task.due_date >= f.due_from)
        if f.due_to:
            query = query.where(Task.due_date <= f.due_to)
        if f.overdue is True:
            query = query.where(self._overdue_condition())
        elif f.overdue is False:
            query = query.where(~self._overdue_condition())
        return query

    def list(self, f: TaskFilters, sort: SortOption, limit: int, offset: int):
        query = self._filtered(f)
        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        tasks = self.db.scalars(
            query.order_by(*SORTS[sort], Task.id.desc()).limit(limit).offset(offset)
        ).all()
        return [self.to_out(t) for t in tasks], total

    def get(self, task_id: int) -> Task:
        task = self.db.scalar(select(Task).where(Task.id == task_id, Task.user_id == self.user.id))
        if task is None:
            raise TaskNotFound
        return task

    def tags(self) -> list[TagOut]:
        rows = self.db.execute(
            select(Tag.name, func.count(task_tags.c.task_id))
            .outerjoin(task_tags, task_tags.c.tag_id == Tag.id)
            .where(Tag.user_id == self.user.id)
            .group_by(Tag.id, Tag.name)
            .order_by(Tag.name)
        ).all()
        return [TagOut(name=name, tasks=count) for name, count in rows]

    def stats(self) -> dict:
        mine = Task.user_id == self.user.id
        by_status = dict.fromkeys(TaskStatus, 0)
        for value, count in self.db.execute(
            select(Task.status, func.count()).where(mine).group_by(Task.status)
        ):
            by_status[value] = count
        open_by_priority = dict.fromkeys(Priority, 0)
        for value, count in self.db.execute(
            select(Task.priority, func.count())
            .where(mine, Task.status != TaskStatus.DONE)
            .group_by(Task.priority)
        ):
            open_by_priority[value] = count
        overdue = self.db.scalar(select(func.count()).where(mine, self._overdue_condition()))
        due_today = self.db.scalar(
            select(func.count()).where(
                mine, Task.due_date == self.today, Task.status != TaskStatus.DONE
            )
        )
        total = sum(by_status.values())
        done = by_status[TaskStatus.DONE]
        return {
            "total": total,
            "by_status": by_status,
            "open_by_priority": open_by_priority,
            "overdue": overdue,
            "due_today": due_today,
            "completion_rate": round(done / total, 4) if total else 0.0,
        }

    # ----- escrita -----

    def _tags_named(self, names: list[str]) -> list[Tag]:
        """Busca as etiquetas do usuário pelo nome e cria as que ainda não existem."""
        if not names:
            return []
        existing = {
            tag.name: tag
            for tag in self.db.scalars(
                select(Tag).where(Tag.user_id == self.user.id, Tag.name.in_(names))
            )
        }
        for name in names:
            if name not in existing:
                existing[name] = Tag(user_id=self.user.id, name=name)
                self.db.add(existing[name])
        return [existing[name] for name in names]

    def _drop_unused_tags(self) -> None:
        self.db.flush()
        self.db.execute(delete(Tag).where(Tag.user_id == self.user.id, ~Tag.tasks.any()))

    @staticmethod
    def _track_completion(task: Task) -> None:
        if task.status == TaskStatus.DONE and task.completed_at is None:
            task.completed_at = utc_now()
        elif task.status != TaskStatus.DONE:
            task.completed_at = None

    def create(self, data: TaskCreate) -> Task:
        task = Task(
            user_id=self.user.id,
            title=data.title,
            description=data.description or None,
            status=data.status,
            priority=data.priority,
            due_date=data.due_date,
            tags=self._tags_named(data.tags),
        )
        self._track_completion(task)
        self.db.add(task)
        self.db.flush()
        return task

    def update(self, task_id: int, data: TaskUpdate) -> Task:
        task = self.get(task_id)
        changes = data.model_dump(exclude_unset=True)
        if "tags" in changes:
            task.tags = self._tags_named(changes.pop("tags"))
        if "description" in changes:
            changes["description"] = changes["description"] or None
        for name, value in changes.items():
            setattr(task, name, value)
        task.updated_at = utc_now()
        self._track_completion(task)
        self._drop_unused_tags()
        self.db.refresh(task)
        return task

    def delete(self, task_id: int) -> None:
        self.db.delete(self.get(task_id))
        self._drop_unused_tags()
