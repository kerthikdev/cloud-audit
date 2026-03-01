"""
User management routes — Admin only.
Only admins can create, update, or deactivate users.
Viewers can only read their own profile (via /auth/me).
"""
from __future__ import annotations

import logging
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import hash_password, get_current_user, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: str = "viewer"    # Default to viewer for safety


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    email: Optional[str] = None
    password: Optional[str] = None


def _user_out(doc: dict) -> dict:
    """Convert MongoDB document to safe API response (no password hash)."""
    return {
        "id": str(doc["_id"]),
        "username": doc.get("username", ""),
        "email": doc.get("email"),
        "role": doc.get("role", "viewer"),
        "is_active": doc.get("is_active", True),
        "created_by": doc.get("created_by", "unknown"),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_users(current_user: dict = Depends(require_admin)):
    """List all users. Admin only."""
    db = get_db()
    users = await db["users"].find({}).to_list(length=500)
    return {
        "users": [_user_out(u) for u in users],
        "total": len(users),
    }


@router.post("", status_code=201)
async def create_user(
    payload: UserCreate,
    current_user: dict = Depends(require_admin),
):
    """
    Create a new user account. Admin only.
    Assign 'admin' or 'viewer' role.
    """
    db = get_db()
    username = payload.username.strip().lower()

    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    if payload.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")

    existing = await db["users"].find_one({"username": username})
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{username}' already exists")

    result = await db["users"].insert_one({
        "username": username,
        "email": payload.email,
        "hashed_password": hash_password(payload.password),
        "role": payload.role,
        "is_active": True,
        "created_by": current_user["username"],
    })

    logger.info(f"Admin '{current_user['username']}' created user '{username}' with role '{payload.role}'")
    return {
        "message": f"User '{username}' created with role '{payload.role}'",
        "id": str(result.inserted_id),
        "role": payload.role,
    }


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    payload: UserUpdate,
    current_user: dict = Depends(require_admin),
):
    """Update user role, status, email, or password. Admin only."""
    db = get_db()

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    user = await db["users"].find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deactivating themselves
    if str(user["_id"]) == user_id and current_user["_id"] == user_id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    updates: dict = {}
    if payload.role is not None:
        if payload.role not in ("admin", "viewer"):
            raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")
        updates["role"] = payload.role

    if payload.is_active is not None:
        updates["is_active"] = payload.is_active

    if payload.email is not None:
        updates["email"] = payload.email

    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        updates["hashed_password"] = hash_password(payload.password)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db["users"].update_one({"_id": oid}, {"$set": updates})
    updated = await db["users"].find_one({"_id": oid})
    logger.info(f"Admin '{current_user['username']}' updated user '{user['username']}': {list(updates.keys())}")
    return {"message": "User updated", **_user_out(updated)}


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_admin),
):
    """Delete a user permanently. Admin only. Cannot delete yourself."""
    db = get_db()

    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    user = await db["users"].find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user["username"] == current_user["username"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    await db["users"].delete_one({"_id": oid})
    logger.info(f"Admin '{current_user['username']}' deleted user '{user['username']}'")
