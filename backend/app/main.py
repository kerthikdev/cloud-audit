"""
FastAPI application entry point.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import init_db
from app.services.scheduler import start_scheduler, stop_scheduler

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloud Resource Audit Platform",
    description="Multi-region AWS Resource Audit Engine with FinOps Analytics",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from app.api.routes import audit, health, settings as settings_route
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.api.routes.analytics import router as analytics_router

app.include_router(health.router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(settings_route.router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")


# ── Startup / Shutdown ────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Cloud Resource Audit Platform v2.0.0")
    init_db()
    _upgrade_viewer_users_to_admin()
    start_scheduler()
    _load_historical_sessions()
    logger.info("Startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    stop_scheduler()
    logger.info("Shutdown complete")


def _upgrade_viewer_users_to_admin():
    """One-time migration: promote all viewer-role users to admin."""
    try:
        from app.core.database import SessionLocal
        from app.models.user import User
        db = SessionLocal()
        viewers = db.query(User).filter(User.role == "viewer").all()
        if viewers:
            for u in viewers:
                u.role = "admin"
            db.commit()
            logger.info(f"Upgraded {len(viewers)} viewer user(s) to admin")
        db.close()
    except Exception as e:
        logger.warning(f"Could not upgrade viewer users: {e}")


def _load_historical_sessions():
    """Load recent scan sessions from DB into in-memory store on startup."""
    try:
        from app.core.database import SessionLocal
        from app.models.scan import ScanSession
        from app.core import store

        db = SessionLocal()
        sessions = db.query(ScanSession).order_by(ScanSession.started_at.desc()).limit(50).all()
        for s in sessions:
            if s.id not in store.scan_sessions:
                store.scan_sessions[s.id] = s.to_dict()
        db.close()
        logger.info(f"Loaded {len(sessions)} historical scan sessions from DB")
    except Exception as e:
        logger.warning(f"Could not load historical sessions: {e}")


# ── Version Endpoint ──────────────────────────────────────────────────────────
@app.get("/api/v1/version")
async def version():
    s = get_settings()
    return {
        "version": "3.0.0",
        "app_env": s.app_env,
        "mock_aws": s.mock_aws,
        "features": [
            "parallel_scanning", "sqlite_persistence", "jwt_auth", "scheduler", "slack_alerts",
            "compliance_scoring", "risk_engine", "cost_forecasting", "pdf_reports",
            "lambda_scanning", "iam_scanning", "cloudfront_scanning", "cloudwatch_scanning",
        ],
    }
