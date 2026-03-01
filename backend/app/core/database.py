"""
MongoDB connection module using Motor (async driver).
Only the users collection lives in MongoDB.
All scan, violation, and recommendation data stays in the in-memory store.

Set MONGODB_URI in .env to your MongoDB Atlas connection string.
Example:
  MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/cloudaudit?retryWrites=true&w=majority

If not set, falls back to localhost:27017.
"""
from __future__ import annotations

import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        settings = get_settings()
        uri = settings.mongodb_uri
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
        logger.info(f"MongoDB client created (uri prefix: {uri[:30]}…)")
    return _client


def get_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        settings = get_settings()
        _db = get_mongo_client()[settings.mongodb_db_name]
    return _db


async def init_db() -> None:
    """
    Create indexes on the users collection.
    Called at application startup.
    """
    db = get_db()
    users = db["users"]
    await users.create_index("username", unique=True)
    await users.create_index("email", sparse=True)
    logger.info("MongoDB indexes created/verified on 'users' collection")


async def close_db() -> None:
    global _client
    if _client:
        _client.close()
        _client = None
        logger.info("MongoDB client closed")


async def user_count() -> int:
    """Return the number of registered users."""
    return await get_db()["users"].count_documents({})
