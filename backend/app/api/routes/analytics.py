"""
Analytics API Route
===================
Provides:
  GET /api/v1/analytics/forecast   — cost waste forecasting
  GET /api/v1/analytics/trends     — historical resource/violation/cost trends
  GET /api/v1/analytics/compliance — overall compliance score across all scans
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.core import store
from app.core.security import get_current_user
from app.services.cost_forecaster import forecast_costs
from app.services.compliance_scorer import score_compliance

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Helper ──────────────────────────────────────────────────────────────────

def _build_scan_history() -> list[dict[str, Any]]:
    """Build ordered scan history from in-memory store for forecasting."""
    sessions = store.list_sessions()
    if not sessions:
        return []
    # Order by started_at
    ordered = sorted(sessions, key=lambda s: s.get("started_at", ""))
    history = []
    for idx, s in enumerate(ordered):
        # list_sessions() returns dicts with key "id"
        scan_id = s.get("id") or s.get("scan_id", "")
        recs = store.scan_recommendations.get(scan_id, [])
        waste = sum(r.get("estimated_monthly_savings", 0) for r in recs)
        viols = store.scan_violations.get(scan_id, [])
        resources = store.scan_resources.get(scan_id, [])
        history.append({
            "scan_index": idx,
            "scan_id": scan_id,
            "started_at": s.get("started_at", ""),
            "total_monthly_waste": round(waste, 2),
            "total_resources": len(resources),
            "total_violations": len(viols),
            "critical_violations": sum(1 for v in viols if v.get("severity") == "CRITICAL"),
        })
    return history


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/forecast")
async def get_forecast(current_user=Depends(get_current_user)) -> dict[str, Any]:
    """Return 30/60/90-day cost waste projections based on scan history."""
    history = _build_scan_history()
    return forecast_costs(history)


@router.get("/trends")
async def get_trends(current_user=Depends(get_current_user)) -> dict[str, Any]:
    """Return time-series data of resources, violations, and waste per scan."""
    history = _build_scan_history()

    # Aggregate violation breakdowns across all completed scans
    vio_by_type: dict[str, int] = {}
    vio_by_sev: dict[str, int] = {}
    for h in history:
        for v in store.scan_violations.get(h["scan_id"], []):
            rtype = v.get("resource_type", "Unknown")
            sev = v.get("severity", "LOW")
            vio_by_type[rtype] = vio_by_type.get(rtype, 0) + 1
            vio_by_sev[sev] = vio_by_sev.get(sev, 0) + 1

    return {
        "scan_count": len(history),
        "series": history,
        "violation_by_type": vio_by_type,
        "violation_by_severity": vio_by_sev,
        "summary": {
            "avg_monthly_waste": round(
                sum(h["total_monthly_waste"] for h in history) / max(len(history), 1), 2
            ),
            "avg_violations": round(
                sum(h["total_violations"] for h in history) / max(len(history), 1), 1
            ),
            "latest_waste": history[-1]["total_monthly_waste"] if history else 0,
        },
    }


@router.get("/compliance")
async def get_compliance_summary(current_user=Depends(get_current_user)) -> dict[str, Any]:
    """Return compliance scores computed from the latest scan's violations."""
    sessions = store.list_sessions()
    if not sessions:
        return {"error": "No scans available", "frameworks": {}, "overall_score": 0}

    latest = sorted(sessions, key=lambda s: s.get("started_at", ""))[-1]
    scan_id = latest.get("id") or latest.get("scan_id", "")
    violations = store.scan_violations.get(scan_id, [])
    compliance = score_compliance(violations)
    compliance["scan_id"] = scan_id
    compliance["based_on"] = latest.get("started_at", "")
    return compliance
