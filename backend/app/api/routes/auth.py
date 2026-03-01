"""
Authentication routes: first-time setup (register), login, refresh, logout, profile.

IMPORTANT LOGIC:
  - /auth/register      → Only allowed when ZERO users exist in DB (first-time setup).
                          The first user automatically becomes admin.
                          After that, this endpoint returns 403.
  - /auth/login         → Standard username/password → JWT
  - /auth/me            → Returns current user profile
  - /auth/refresh       → Issues a fresh JWT (JWT auto-refresh flow)
  - /auth/logout        → Stateless (frontend deletes token)
  - /auth/status        → Returns {initialized: bool} — used by frontend to decide
                          whether to show Register or Login tab.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.database import get_db, user_count
from app.core.security import (
    create_access_token, get_current_user, hash_password, verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request / Response schemas ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def auth_status():
    """
    Returns whether the platform has been initialized (at least one user exists).
    The frontend uses this to decide whether to show the Register or Login form.
    """
    count = await user_count()
    return {"initialized": count > 0}


@router.post("/register", status_code=201)
async def register(payload: RegisterRequest):
    """
    First-time setup only. Creates the initial admin account.
    If any user already exists, returns 403 — subsequent users are created
    by admins via POST /api/v1/users.
    """
    count = await user_count()
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform already initialized. Contact your admin to create an account.",
        )

    username = payload.username.strip().lower()
    if not username or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Username required and password must be at least 6 characters")

    db = get_db()
    existing = await db["users"].find_one({"username": username})
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    await db["users"].insert_one({
        "username": username,
        "email": payload.email,
        "hashed_password": hash_password(payload.password),
        "role": "admin",    # First user is always admin
        "is_active": True,
        "created_by": "self",
    })

    logger.info(f"Initial admin user registered: {username}")
    return {"message": f"Admin account '{username}' created. You can now sign in.", "role": "admin"}


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    """Authenticate and return a JWT access token."""
    db = get_db()
    username = payload.username.strip().lower()
    user = await db["users"].find_one({"username": username, "is_active": True})

    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    token = create_access_token(
        data={"sub": user["username"], "role": user["role"]},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    logger.info(f"User logged in: {user['username']} (role: {user['role']})")
    return TokenResponse(access_token=token, username=user["username"], role=user["role"])


@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Issue a fresh JWT for the current user (auto-refresh flow)."""
    settings = get_settings()
    token = create_access_token(
        data={"sub": current_user["username"], "role": current_user["role"]},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return current authenticated user profile."""
    return {
        "username": current_user["username"],
        "email": current_user.get("email"),
        "role": current_user["role"],
        "is_active": current_user.get("is_active", True),
    }


@router.post("/logout")
async def logout():
    """
    Stateless JWT — logout is handled client-side by deleting the token.
    This endpoint exists for UI convention and logging.
    """
    return {"message": "Logged out successfully"}
