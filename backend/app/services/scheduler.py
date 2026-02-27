"""
APScheduler-based automatic scan scheduler.
Reads cron expression from settings and triggers scans automatically.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_scheduler = None


def _scheduled_scan() -> None:
    """Run a scan triggered by the scheduler."""
    from app.core.config import get_settings
    from app.core import store
    import uuid
    from datetime import datetime

    settings = get_settings()
    regions = (
        [r.strip() for r in settings.schedule_regions.split(",") if r.strip()]
        if settings.schedule_regions
        else settings.scan_regions_list
    )

    logger.info(f"[Scheduler] Starting scheduled scan for regions: {regions}")

    scan_id = str(uuid.uuid4())
    store.scan_sessions[scan_id] = {
        "id": scan_id,
        "status": "pending",
        "regions": regions,
        "resource_types": ["EC2", "EBS", "S3", "RDS", "EIP", "SNAPSHOT", "LB", "NAT"],
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "resource_count": 0,
        "violation_count": 0,
        "triggered_by": "scheduler",
    }

    from app.api.routes.audit import _run_scan
    _run_scan(scan_id, regions, ["EC2", "EBS", "S3", "RDS", "EIP", "SNAPSHOT", "LB", "NAT"])
    logger.info(f"[Scheduler] Scheduled scan {scan_id} complete")


def start_scheduler() -> None:
    """Start APScheduler if a cron schedule is configured."""
    global _scheduler
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.schedule_cron:
        logger.info("No scan schedule configured — scheduler not started")
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        cron_parts = settings.schedule_cron.strip().split()
        if len(cron_parts) != 5:
            logger.warning(f"Invalid cron expression: '{settings.schedule_cron}' — scheduler not started")
            return

        minute, hour, day, month, day_of_week = cron_parts
        trigger = CronTrigger(
            minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week
        )

        _scheduler = BackgroundScheduler()
        _scheduler.add_job(_scheduled_scan, trigger, id="auto_scan", replace_existing=True)
        _scheduler.start()
        logger.info(f"Scan scheduler started with cron: '{settings.schedule_cron}'")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")


def stop_scheduler() -> None:
    """Stop the running scheduler (called on app shutdown)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def get_scheduler_status() -> dict[str, Any]:
    """Return scheduler status and next run time."""
    from app.core.config import get_settings
    settings = get_settings()

    if not _scheduler or not _scheduler.running:
        return {"running": False, "cron": settings.schedule_cron or None, "next_run": None}

    job = _scheduler.get_job("auto_scan")
    return {
        "running": True,
        "cron": settings.schedule_cron,
        "next_run": str(job.next_run_time) if job else None,
    }
