"""Ponto de entrada: monta a aplicação FastAPI.

Rodar localmente:  uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import sessionmaker

from app import errors
from app.config import Settings
from app.database import Base, make_engine
from app.deps import get_today
from app.ratelimit import LoginLimiter
from app.routers import auth, tasks
from app.security import hash_password
from app.seed import DEMO_EMAIL, DEMO_PASSWORD, seed_demo

__version__ = "1.0.0"

DESCRIPTION = """
API para organizar tarefas pessoais: cada pessoa cria a própria conta e só vê as
próprias tarefas.

**Como testar por aqui:**

1. Clique em **Authorize** (cadeado, à direita) e entre com a conta de demonstração:
   `{email}` e senha `{password}` (ou crie a sua em `POST /auth/register`).
2. Abra uma rota, clique em **Try it out** e depois em **Execute**.

Recursos: login com JWT, prioridade, prazo e etiquetas, filtros combinados, busca,
ordenação, paginação e um resumo com tarefas atrasadas e taxa de conclusão.
"""


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    engine = make_engine(settings.database_url)
    session_factory = sessionmaker(engine, expire_on_commit=False)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)
        if settings.seed_demo:
            with session_factory.begin() as db:
                seed_demo(db, get_today(settings), settings.password_iterations)
        yield
        engine.dispose()

    app = FastAPI(
        title="API de Tarefas",
        version=__version__,
        description=DESCRIPTION.format(email=DEMO_EMAIL, password=DEMO_PASSWORD),
        lifespan=lifespan,
        license_info={"name": "MIT"},
        openapi_tags=[
            {"name": "Autenticação", "description": "Conta e login (token JWT)."},
            {"name": "Tarefas", "description": "Tarefas e etiquetas da pessoa logada."},
            {"name": "Sistema"},
        ],
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.login_limiter = LoginLimiter(
        settings.login_max_attempts, settings.login_window_seconds
    )
    app.state.dummy_hash = hash_password("senha-inexistente", settings.password_iterations)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    errors.register(app)
    app.include_router(auth.router)
    app.include_router(tasks.router)

    @app.get("/", include_in_schema=False)
    def home() -> RedirectResponse:
        return RedirectResponse("/docs")

    @app.get("/health", tags=["Sistema"], summary="Verifica se a API está no ar")
    def health() -> dict:
        return {"status": "ok", "version": __version__}

    return app


app = create_app()
