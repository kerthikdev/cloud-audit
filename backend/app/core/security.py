"""
Security utilities: JWT token creation/verification, password hashing.
Uses Python stdlib (hashlib PBKDF2-SHA256) — no bcrypt/passlib dependency needed.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, APIKeyHeader
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

# FastAPI security schemes
_bearer_scheme = HTTPBearer(auto_error=False)
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

_ITERATIONS = 260_000   # NIST recommended for PBKDF2-SHA256 in 2024


# ── Password helpers (stdlib only — no bcrypt/passlib) ────────────────────────

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-SHA256 with a random salt.
    Format: pbkdf2:sha256:<iters>$<salt_hex>$<hash_hex>
    """
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS
    )
    return f"pbkdf2:sha256:{_ITERATIONS}${salt}${dk.hex()}"


def verify_password(plain: str, stored: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2 hash."""
    try:
        algo_part, rest = stored.split(":", 1)
        _algo, hash_name, iters_str = algo_part.split(":") if ":" in algo_part else ("pbkdf2", "sha256", str(_ITERATIONS))
        # Handle format: pbkdf2:sha256:<iters>$<salt>$<hash>
        parts = stored.split("$")
        if len(parts) != 3:
            return False
        header, salt, stored_hash = parts
        iters = int(header.split(":")[-1])
        dk = hashlib.pbkdf2_hmac(
            "sha256", plain.encode("utf-8"), salt.encode("utf-8"), iters
        )
        return hmac.compare_digest(dk.hex(), stored_hash)
    except Exception:
        return False


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


# ── FastAPI dependency ────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
    api_key: str | None = Security(_api_key_header),
    db: Session = Depends(get_db),
):
    """Resolve current user from Bearer JWT or X-API-Key header."""
    from app.models.user import User

    settings = get_settings()

    # API Key fast path
    if api_key and settings.api_key and api_key == settings.api_key:
        user = db.query(User).filter(User.username == "api_key_user", User.is_active == True).first()
        if not user:
            user = User(username="api_key_user", hashed_password="", role="admin", is_active=True)
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    # JWT Bearer token
    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            username: str = payload.get("sub", "")
            if not username:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
            user = db.query(User).filter(User.username == username, User.is_active == True).first()
            if not user:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
            return user
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated — provide a Bearer token or X-API-Key",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_admin(current_user=Depends(get_current_user)):
    """Dependency that requires admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user
