"""Conta de demonstração com tarefas de exemplo (ligada por SEED_DEMO=true)."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Priority, TaskStatus, User
from app.schemas import TaskCreate
from app.security import hash_password
from app.services import TaskService

DEMO_EMAIL = "demo@tarefas.dev"
DEMO_PASSWORD = "demo12345"

P, S = Priority, TaskStatus
# (título, descrição, situação, prioridade, prazo em dias a partir de hoje, etiquetas)
EXAMPLES = [
    (
        "Mandar o orçamento para o Seu Antônio",
        "Conferir o valor do frete antes de enviar.",
        S.PENDING,
        P.HIGH,
        -2,
        ["trabalho"],
    ),
    ("Preparar a apresentação de quinta", None, S.IN_PROGRESS, P.HIGH, 0, ["trabalho"]),
    (
        "Terminar o curso de FastAPI",
        "Faltam os módulos 7 e 8.",
        S.IN_PROGRESS,
        P.MEDIUM,
        3,
        ["estudos"],
    ),
    ("Pagar o boleto da internet", None, S.PENDING, P.HIGH, 5, ["casa", "contas"]),
    (
        "Atualizar o currículo",
        "Colocar os dois projetos novos do portfólio.",
        S.PENDING,
        P.MEDIUM,
        7,
        ["carreira"],
    ),
    ("Comprar o presente da Júlia", None, S.PENDING, P.LOW, 12, ["pessoal"]),
    ("Levar o carro na revisão", None, S.DONE, P.MEDIUM, -5, ["carro"]),
    ("Renovar a CNH", None, S.DONE, P.LOW, None, ["pessoal"]),
    ("Separar as fotos da viagem", None, S.PENDING, P.LOW, None, ["pessoal"]),
]


def seed_demo(db: Session, today: date, iterations: int) -> bool:
    """Cria a conta de demonstração, se ainda não existir. Devolve True se criou."""
    if db.scalar(select(User.id).where(User.email == DEMO_EMAIL)) is not None:
        return False
    user = User(
        name="Camila (demonstração)",
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD, iterations),
    )
    db.add(user)
    db.flush()
    service = TaskService(db, user, today)
    for title, description, status, priority, days, tags in EXAMPLES:
        service.create(
            TaskCreate(
                title=title,
                description=description,
                status=status,
                priority=priority,
                due_date=today + timedelta(days=days) if days is not None else None,
                tags=tags,
            )
        )
    return True
