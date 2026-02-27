"""
Authentication routes: register, login, profile.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token, get_current_user, hash_password, verify_password,
)
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.post("/register", status_code=201)
async def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user.
    All users get admin role so everyone can run scans and manage settings.
    """
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role="admin",  # All users get full access
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info(f"New user registered: {payload.username} (admin)")
    return {"message": f"User '{payload.username}' created", "role": "admin"}


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate and return a JWT access token."""
    user = db.query(User).filter(User.username == payload.username, User.is_active == True).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    logger.info(f"User logged in: {user.username}")
    return TokenResponse(access_token=token, username=user.username, role=user.role)


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return current authenticated user profile."""
    return current_user.to_dict()


@router.post("/logout")
async def logout():
    """
    Stateless JWT — logout is handled client-side by deleting the token.
    This endpoint exists for UI convention.
    """
    return {"message": "Logged out successfully"}
