"""
User management routes.
All authenticated users can list, create, update, and delete users.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: str = "admin"


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: bool

    class Config:
        from_attributes = True


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all users."""
    from app.models.user import User
    users = db.query(User).order_by(User.id).all()
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
            }
            for u in users
        ],
        "total": len(users),
    }


@router.post("", status_code=201)
async def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new user."""
    from app.models.user import User

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=409, detail=f"Username '{payload.username}' already exists")

    if payload.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info(f"User {current_user.username} created user {user.username} (role: {user.role})")
    return {"message": f"User '{user.username}' created", "id": user.id, "role": user.role}


@router.patch("/{user_id}")
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update user role, active status, or password."""
    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent user from deactivating themselves
    if user.id == current_user.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    if payload.role is not None:
        if payload.role not in ("admin", "viewer"):
            raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")
        user.role = payload.role

    if payload.is_active is not None:
        user.is_active = payload.is_active

    if payload.password:
        user.hashed_password = hash_password(payload.password)

    db.commit()
    return {"message": "User updated", "id": user.id, "username": user.username, "role": user.role, "is_active": user.is_active}


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a user (cannot delete self)."""
    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    db.delete(user)
    db.commit()
    logger.info(f"User {current_user.username} deleted user {user.username}")
