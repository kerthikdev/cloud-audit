"""
Analytics API Route
===================
Provides:
  GET /api/v1/analytics/forecast      — cost waste forecasting
  GET /api/v1/analytics/trends        — historical resource/violation/cost trends
  GET /api/v1/analytics/compliance    — overall compliance score across all scans
  GET /api/v1/analytics/top-resources — top 20 riskiest resources from latest scan
  GET /api/v1/analytics/top-owners    — top 10 resource owners by resource count
"""
from __future__ import annotations

import logging
from collections import defaultdict
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


def _latest_scan_id() -> str | None:
    """Return the scan_id of the most-recently completed scan."""
    sessions = store.list_sessions()
    if not sessions:
        return None
    completed = [s for s in sessions if s.get("status") == "completed"]
    if not completed:
        return None
    return sorted(completed, key=lambda s: s.get("started_at", ""))[-1].get("id")


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


@router.get("/top-resources")
async def get_top_resources(
    limit: int = 20,
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return the top N riskiest resources from the most recent completed scan,
    sorted by risk_score descending. Ties broken by violation_count.
    """
    scan_id = _latest_scan_id()
    if not scan_id:
        return {"resources": [], "scan_id": None, "total": 0}

    resources = store.scan_resources.get(scan_id, [])

    # Sort: highest risk first, then most violations
    ranked = sorted(
        resources,
        key=lambda r: (r.get("risk_score", 0), r.get("violation_count", 0)),
        reverse=True,
    )

    top = [
        {
            "resource_id":      r.get("resource_id", "—"),
            "resource_type":    r.get("resource_type", "Unknown"),
            "name":             r.get("name") or r.get("resource_id", "—"),
            "region":           r.get("region", "—"),
            "state":            r.get("state", "—"),
            "risk_score":       r.get("risk_score", 0),
            "violation_count":  r.get("violation_count", 0),
            "tags":             r.get("tags", {}),
        }
        for r in ranked[:limit]
    ]

    return {
        "resources": top,
        "scan_id": scan_id,
        "total": len(resources),
        "shown": len(top),
    }


@router.get("/top-owners")
async def get_top_owners(
    limit: int = 10,
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return the top N resource owners from the most recent scan,
    grouped by Owner / Team / Environment tags (in priority order).
    Sorted by resource count descending.
    """
    scan_id = _latest_scan_id()
    if not scan_id:
        return {"owners": [], "scan_id": None}

    resources = store.scan_resources.get(scan_id, [])
    violations = store.scan_violations.get(scan_id, [])

    # Build violation lookup: resource_id → list of violations
    viol_map: dict[str, list[dict]] = defaultdict(list)
    for v in violations:
        viol_map[v.get("resource_id", "")].append(v)

    # Group resources by owner tag (priority: Owner > Team > Environment > Untagged)
    owner_buckets: dict[str, dict[str, Any]] = {}

    for r in resources:
        tags = r.get("tags", {}) or {}
        owner = (
            tags.get("Owner")
            or tags.get("owner")
            or tags.get("Team")
            or tags.get("team")
            or tags.get("Environment")
            or tags.get("environment")
            or "Untagged"
        )

        if owner not in owner_buckets:
            owner_buckets[owner] = {
                "owner":           owner,
                "resource_count":  0,
                "violation_count": 0,
                "critical_count":  0,
                "resource_types":  defaultdict(int),
                "regions":         set(),
            }

        b = owner_buckets[owner]
        b["resource_count"] += 1
        b["regions"].add(r.get("region", ""))

        rid = r.get("resource_id", "")
        b["violation_count"] += len(viol_map.get(rid, []))
        b["critical_count"] += sum(
            1 for v in viol_map.get(rid, []) if v.get("severity") == "CRITICAL"
        )
        b["resource_types"][r.get("resource_type", "Unknown")] += 1

    # Sort by resource_count desc, take top N
    ranked = sorted(owner_buckets.values(), key=lambda x: x["resource_count"], reverse=True)

    owners = []
    for b in ranked[:limit]:
        # Top 3 resource types for this owner
        top_types = sorted(b["resource_types"].items(), key=lambda x: x[1], reverse=True)[:3]
        owners.append({
            "owner":           b["owner"],
            "resource_count":  b["resource_count"],
            "violation_count": b["violation_count"],
            "critical_count":  b["critical_count"],
            "regions":         sorted(b["regions"]),
            "top_types":       [{"type": t, "count": c} for t, c in top_types],
            "is_untagged":     b["owner"] == "Untagged",
        })

    return {
        "owners": owners,
        "scan_id": scan_id,
        "total_owners": len(owner_buckets),
        "total_resources": len(resources),
    }


@router.get("/tags")
async def get_tag_analysis(current_user=Depends(get_current_user)) -> dict[str, Any]:
    """Tag-based cost allocation: group resources by Environment tag, compute waste per group."""
    scan_id = _latest_scan_id()
    if not scan_id:
        return {"groups": [], "untagged_count": 0, "untagged_percentage": 0, "total_resources": 0}

    resources = store.scan_resources.get(scan_id, [])
    recs = store.scan_recommendations.get(scan_id, [])
    viols = store.scan_violations.get(scan_id, [])

    # Map resource_id → savings
    savings_map: dict[str, float] = defaultdict(float)
    for rec in recs:
        savings_map[rec.get("resource_id", "")] += rec.get("estimated_monthly_savings", 0.0)

    viol_count_map: dict[str, int] = defaultdict(int)
    for v in viols:
        viol_count_map[v.get("resource_id", "")] += 1

    groups: dict[str, dict] = {}
    untagged = 0
    for r in resources:
        tags = r.get("tags") or {}
        env = tags.get("Environment") or tags.get("environment") or "Untagged"
        if env == "Untagged":
            untagged += 1
        if env not in groups:
            groups[env] = {"tag_value": env, "resource_count": 0, "violation_count": 0, "estimated_monthly_savings": 0.0}
        rid = r.get("resource_id", "")
        groups[env]["resource_count"] += 1
        groups[env]["violation_count"] += viol_count_map.get(rid, 0)
        groups[env]["estimated_monthly_savings"] += savings_map.get(rid, 0.0)

    sorted_groups = sorted(groups.values(), key=lambda g: g["resource_count"], reverse=True)
    total = len(resources)
    return {
        "groups": sorted_groups,
        "untagged_count": untagged,
        "untagged_percentage": round(untagged / max(total, 1) * 100, 1),
        "total_resources": total,
    }




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
