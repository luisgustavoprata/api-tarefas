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
        "Enviar proposta para o cliente",
        "Revisar valores antes de enviar.",
        S.PENDING,
        P.HIGH,
        -2,
        ["trabalho"],
    ),
    ("Preparar apresentação da sprint", None, S.IN_PROGRESS, P.HIGH, 0, ["trabalho", "reuniao"]),
    (
        "Estudar FastAPI: dependências",
        "Capítulo sobre Depends e testes.",
        S.IN_PROGRESS,
        P.MEDIUM,
        3,
        ["estudos"],
    ),
    ("Pagar conta de internet", None, S.PENDING, P.HIGH, 5, ["casa", "financas"]),
    (
        "Atualizar currículo e LinkedIn",
        "Incluir os projetos novos do portfólio.",
        S.PENDING,
        P.MEDIUM,
        7,
        ["carreira"],
    ),
    ("Comprar presente de aniversário", None, S.PENDING, P.LOW, 12, ["pessoal"]),
    ("Configurar backup do notebook", None, S.DONE, P.MEDIUM, -5, ["casa"]),
    ("Ler artigo sobre testes automatizados", None, S.DONE, P.LOW, None, ["estudos"]),
    ("Organizar fotos da viagem", None, S.PENDING, P.LOW, None, ["pessoal"]),
]


def seed_demo(db: Session, today: date, iterations: int) -> bool:
    """Cria a conta de demonstração, se ainda não existir. Devolve True se criou."""
    if db.scalar(select(User.id).where(User.email == DEMO_EMAIL)) is not None:
        return False
    user = User(
        name="Usuária Demo",
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
