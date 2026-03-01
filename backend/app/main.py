"""
FastAPI application entry point — v4.0.0 with MongoDB user store.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloud Resource Audit Platform",
    description="Multi-region AWS Resource Audit Engine with FinOps Analytics",
    version="4.0.0",
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
from app.api.routes.diff import router as diff_router
from app.api.routes.remediation import router as remediation_router
from app.api.routes.tags import router as tags_router

app.include_router(health.router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(settings_route.router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(diff_router, prefix="/api/v1")
app.include_router(remediation_router, prefix="/api/v1")
app.include_router(tags_router, prefix="/api/v1")


# ── Startup / Shutdown ────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    logger.info("Starting Cloud Resource Audit Platform v4.0.0")
    from app.core.database import init_db
    from app.services.scheduler import start_scheduler
    await init_db()
    start_scheduler()
    _load_historical_sessions()
    logger.info("Startup complete — MongoDB connected, scheduler running")


@app.on_event("shutdown")
async def shutdown_event():
    from app.core.database import close_db
    from app.services.scheduler import stop_scheduler
    stop_scheduler()
    await close_db()
    logger.info("Shutdown complete")


def _load_historical_sessions():
    """Load recent scan sessions from DB into in-memory store on startup."""
    try:
        from app.core.database import get_db as mongo_db
        # Scan data remains in-memory store — this function is for backwards compat
        # The in-memory store resets on restart (by design for MVP)
        logger.info("In-memory scan store ready")
    except Exception as e:
        logger.warning(f"Could not initialize store: {e}")


# ── Version Endpoint ──────────────────────────────────────────────────────────
@app.get("/api/v1/version")
async def version():
    s = get_settings()
    return {
        "version": "4.0.0",
        "app_env": s.app_env,
        "mock_aws": s.mock_aws,
        "db": "mongodb",
        "features": [
            "parallel_scanning", "mongodb_auth", "jwt_auth", "scheduler", "slack_alerts",
            "compliance_scoring", "risk_engine", "cost_forecasting",
            "lambda_scanning", "iam_scanning", "cloudfront_scanning", "cloudwatch_scanning",
            "search_filter", "pagination", "scan_dedup", "jwt_refresh", "error_boundaries",
            "scan_diff", "remediation_engine", "tag_cost_allocation",
        ],
    }
