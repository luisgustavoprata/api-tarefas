"""Formato dos dados que entram e saem da API (validados pelo Pydantic)."""

import re
from datetime import UTC, date, datetime
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models import Priority, TaskStatus

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
TagName = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=30)
]


class InputModel(BaseModel):
    # Campos desconhecidos são recusados: erro de digitação vira aviso, não é ignorado.
    model_config = ConfigDict(extra="forbid")


def _unique_tags(tags: list[str] | None) -> list[str] | None:
    if tags is None:
        return None
    return list(dict.fromkeys(tags))  # remove repetidas mantendo a ordem


def _as_utc(value: datetime | None) -> datetime | None:
    # O SQLite devolve datas sem fuso; tudo é gravado em UTC, então completamos.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


# ---------- Usuários e login ----------


class UserCreate(InputModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
    email: str = Field(max_length=254, examples=["ana@exemplo.com"])
    password: str = Field(min_length=8, max_length=128, examples=["senha-forte-123"])

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_RE.match(value):
            raise ValueError("E-mail inválido.")
        return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def in_utc(cls, value: datetime) -> datetime:
        return _as_utc(value)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Validade do token, em segundos.")


# ---------- Tarefas ----------


class TaskCreate(InputModel):
    title: Title = Field(examples=["Revisar o relatório mensal"])
    description: Description | None = None
    status: TaskStatus = TaskStatus.PENDING
    priority: Priority = Priority.MEDIUM
    due_date: date | None = Field(default=None, description="Prazo (AAAA-MM-DD).")
    tags: list[TagName] = Field(default_factory=list, max_length=10, examples=[["trabalho"]])

    @field_validator("tags")
    @classmethod
    def unique_tags(cls, value: list[str] | None) -> list[str] | None:
        return _unique_tags(value)


class TaskUpdate(InputModel):
    """Atualização parcial: só os campos enviados mudam. `tags` substitui a lista inteira."""

    title: Title | None = None
    description: Description | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    due_date: date | None = None
    tags: list[TagName] | None = Field(default=None, max_length=10)

    @field_validator("tags")
    @classmethod
    def unique_tags(cls, value: list[str] | None) -> list[str] | None:
        return _unique_tags(value)

    @model_validator(mode="after")
    def no_null_for_required(self) -> Self:
        for name in ("title", "status", "priority", "tags"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"O campo '{name}' não pode ser nulo.")
        if not self.model_fields_set:
            raise ValueError("Envie pelo menos um campo para alterar.")
        return self


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: Priority
    due_date: date | None
    tags: list[str]
    overdue: bool = Field(description="Prazo vencido e tarefa ainda não concluída.")
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    @field_validator("created_at", "updated_at", "completed_at")
    @classmethod
    def in_utc(cls, value: datetime | None) -> datetime | None:
        return _as_utc(value)


class TaskPage(BaseModel):
    items: list[TaskOut]
    total: int = Field(description="Total de tarefas que atendem aos filtros.")
    limit: int
    offset: int


class TagOut(BaseModel):
    name: str
    tasks: int = Field(description="Quantidade de tarefas com esta etiqueta.")


class Stats(BaseModel):
    total: int
    by_status: dict[TaskStatus, int]
    open_by_priority: dict[Priority, int] = Field(
        description="Tarefas não concluídas, por prioridade."
    )
    overdue: int
    due_today: int
    completion_rate: float = Field(description="Concluídas ÷ total, de 0 a 1.")


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorResponse(BaseModel):
    detail: str
    errors: list[ErrorDetail] | None = None
