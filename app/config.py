"""Configuração lida de variáveis de ambiente (veja `.env.example`)."""

import os
from dataclasses import dataclass

DEV_SECRET_KEY = "chave-de-desenvolvimento-troque-em-producao"


def _bool(value: str | None, default: bool) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "sim", "on"}


def normalize_database_url(url: str) -> str:
    """O Render e o Heroku entregam `postgres://`; o SQLAlchemy usa o driver psycopg 3."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url.removeprefix(prefix)
    return url


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./tarefas.db"
    secret_key: str = DEV_SECRET_KEY
    token_minutes: int = 60
    timezone: str = "America/Sao_Paulo"
    seed_demo: bool = False
    password_iterations: int = 600_000
    login_max_attempts: int = 5
    login_window_seconds: int = 300
    cors_origins: tuple[str, ...] = ("*",)
    environment: str = "development"

    @classmethod
    def from_env(cls) -> "Settings":
        env = os.environ
        settings = cls(
            database_url=normalize_database_url(env.get("DATABASE_URL") or cls.database_url),
            secret_key=env.get("SECRET_KEY") or DEV_SECRET_KEY,
            token_minutes=int(env.get("TOKEN_MINUTES") or 60),
            timezone=env.get("APP_TIMEZONE") or cls.timezone,
            seed_demo=_bool(env.get("SEED_DEMO"), False),
            password_iterations=int(env.get("PASSWORD_ITERATIONS") or 600_000),
            login_max_attempts=int(env.get("LOGIN_MAX_ATTEMPTS") or 5),
            login_window_seconds=int(env.get("LOGIN_WINDOW_SECONDS") or 300),
            cors_origins=tuple(
                o.strip() for o in (env.get("CORS_ORIGINS") or "*").split(",") if o.strip()
            ),
            environment=env.get("ENVIRONMENT") or "development",
        )
        if settings.environment == "production" and settings.secret_key == DEV_SECRET_KEY:
            raise RuntimeError("Defina SECRET_KEY em produção.")
        return settings
