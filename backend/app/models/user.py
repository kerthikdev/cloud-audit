"""
User document model for MongoDB reference.
The actual MongoDB operations use Motor directly via get_db().
This file provides helper functions only — no ORM required.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime
from typing import Any


def make_user_doc(
    username: str,
    password: str,
    role: str = "viewer",
    email: str | None = None,
    created_by: str = "self",
) -> dict[str, Any]:
    """Create a new user document dict ready for MongoDB insertion."""
    return {
        "username": username.strip().lower(),
        "email": email,
        "hashed_password": _hash_password(password),
        "role": role,
        "is_active": True,
        "created_by": created_by,
        "created_at": datetime.utcnow().isoformat(),
    }


def _hash_password(password: str) -> str:
    """PBKDF2-SHA256 password hash (same as security.py — local copy to avoid circular import)."""
    ITERATIONS = 260_000
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), ITERATIONS)
    return f"pbkdf2:sha256:{ITERATIONS}${salt}${dk.hex()}"
