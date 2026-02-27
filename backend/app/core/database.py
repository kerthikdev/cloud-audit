"""
SQLAlchemy database engine and session management.
Uses SQLite by default (swappable to PostgreSQL via DB_URL env var).
"""
from __future__ import annotations

import logging
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


import os as _os
from pathlib import Path as _Path

# The canonical data directory is always the backend/ folder (parent of app/)
_BACKEND_DIR = _Path(__file__).resolve().parents[2]  # …/backend/


def _resolve_db_url(url: str) -> str:
    """Convert a relative sqlite:///./path to an absolute path so it never moves with CWD."""
    if url.startswith("sqlite:///./") or url.startswith("sqlite:///.\\"):
        rel_path = url[len("sqlite:///./"):]
        abs_path = _BACKEND_DIR / rel_path
        return f"sqlite:///{abs_path}"
    return url


def _get_engine():
    settings = get_settings()
    db_url = _resolve_db_url(settings.db_url)  # always absolute path

    if db_url.startswith("sqlite"):
        engine = create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )
        # Enable WAL mode for SQLite — much better concurrent read performance
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_conn, _rec):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    else:
        engine = create_engine(db_url, pool_pre_ping=True, pool_size=10, max_overflow=20)

    return engine


engine = _get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Called at application startup."""
    # Import all models so SQLAlchemy registers them
    from app.models import scan, user  # noqa: F401
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized — tables created if not exist")
