"""Tabelas do banco, com o ORM tipado do SQLAlchemy 2."""

import enum
from datetime import UTC, date, datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class TaskStatus(enum.StrEnum):
    PENDING = "pendente"
    IN_PROGRESS = "em_andamento"
    DONE = "concluida"


class Priority(enum.StrEnum):
    LOW = "baixa"
    MEDIUM = "media"
    HIGH = "alta"


def _enum_column(enum_class: type[enum.Enum]) -> Enum:
    # Grava o valor ("pendente") como texto, sem tipo ENUM nativo: migra fácil entre bancos.
    return Enum(
        enum_class,
        native_enum=False,
        length=20,
        values_callable=lambda members: [m.value for m in members],
    )


task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(30))

    tasks: Mapped[list["Task"]] = relationship(secondary=task_tags, back_populates="tags")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TaskStatus] = mapped_column(
        _enum_column(TaskStatus), default=TaskStatus.PENDING, index=True
    )
    priority: Mapped[Priority] = mapped_column(_enum_column(Priority), default=Priority.MEDIUM)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped[User] = relationship(back_populates="tasks")
    tags: Mapped[list[Tag]] = relationship(
        secondary=task_tags, back_populates="tasks", lazy="selectin", order_by=Tag.name
    )

    def is_overdue(self, today: date) -> bool:
        return (
            self.due_date is not None and self.due_date < today and self.status != TaskStatus.DONE
        )
