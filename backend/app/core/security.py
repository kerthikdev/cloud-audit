"""
Security utilities: JWT token creation/verification, password hashing.
Uses stdlib PBKDF2-SHA256 for password hashing — no bcrypt/passlib needed.
Uses Motor (async MongoDB) for user lookup.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, APIKeyHeader
from jose import JWTError, jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

_ITERATIONS = 260_000


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash with PBKDF2-SHA256. Format: pbkdf2:sha256:<iters>$<salt_hex>$<hash_hex>"""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS)
    return f"pbkdf2:sha256:{_ITERATIONS}${salt}${dk.hex()}"


def verify_password(plain: str, stored: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2 hash."""
    try:
        parts = stored.split("$")
        if len(parts) != 3:
            return False
        header, salt, stored_hash = parts
        iters = int(header.split(":")[-1])
        dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), iters)
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


# ── FastAPI dependency — async MongoDB lookup ─────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
    api_key: str | None = Security(_api_key_header),
) -> dict[str, Any]:
    """
    Resolve current user from Bearer JWT or X-API-Key header.
    Returns a dict with: username, role, email, is_active, _id (str)
    """
    from app.core.database import get_db

    settings = get_settings()
    db = get_db()

    # API Key fast path
    if api_key and settings.api_key and api_key == settings.api_key:
        return {"username": "api_key_user", "role": "admin", "email": None, "is_active": True, "_id": "api_key"}

    # JWT Bearer token
    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            username: str = payload.get("sub", "")
            if not username:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

            user = await db["users"].find_one({"username": username, "is_active": True})
            if not user:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

            user["_id"] = str(user["_id"])
            return user

        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials — token may have expired",
                headers={"WWW-Authenticate": "Bearer"},
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated — provide a Bearer token or X-API-Key",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency that requires admin role."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user
