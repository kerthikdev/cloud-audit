"""
Tag-based cost allocation API
=============================
Groups resources by their AWS tags (Environment, Team, Service, etc.)
and provides cost and violation breakdowns per tag group.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from app.core.security import get_current_user
from app.core import store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics/tags", tags=["analytics"])

# Tags to group by — in priority order
_TAG_KEYS = ["Environment", "environment", "env", "Team", "team", "Service", "service", "Project", "project", "Owner", "owner"]


def _primary_tag(tags: dict[str, str]) -> str:
    """Return the first matching classification tag, or 'Untagged'."""
    for key in _TAG_KEYS:
        if key in tags:
            return tags[key]
    return "Untagged"


@router.get("")
async def tag_cost_allocation(
    scan_id: str | None = Query(None, description="Specific scan ID (latest if omitted)"),
    tag_key: str | None = Query(None, description="Custom tag key to group by"),
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Returns resource and violation counts grouped by tag value.
    Also returns estimated monthly savings per tag group.
    """
    # Resolve scan_id to the latest completed scan if not provided
    if not scan_id:
        completed = [
            s for s in store.scan_sessions.values()
            if s.get("status") == "completed"
        ]
        if not completed:
            return {"groups": [], "total_resources": 0, "untagged_percentage": 0}
        completed.sort(key=lambda s: s.get("started_at", ""), reverse=True)
        scan_id = completed[0]["id"]

    resources = store.scan_resources.get(scan_id, [])
    violations = store.scan_violations.get(scan_id, [])
    recs = store.scan_recommendations.get(scan_id, [])

    # Build violation index
    vio_by_resource: dict[str, list[dict]] = {}
    for v in violations:
        rid = v.get("resource_id", "")
        vio_by_resource.setdefault(rid, []).append(v)

    # Build recommendation savings index
    savings_by_resource: dict[str, float] = {}
    for r in recs:
        rid = r.get("resource_id", "")
        savings_by_resource[rid] = savings_by_resource.get(rid, 0) + r.get("estimated_monthly_savings", 0)

    # Group resources by tag
    groups: dict[str, dict[str, Any]] = {}
    for resource in resources:
        tags = resource.get("tags") or {}
        if tag_key:
            group_name = tags.get(tag_key, "Untagged")
        else:
            group_name = _primary_tag(tags)

        if group_name not in groups:
            groups[group_name] = {
                "tag_value": group_name,
                "resource_count": 0,
                "violation_count": 0,
                "critical_violations": 0,
                "estimated_monthly_savings": 0.0,
                "resource_types": {},
                "regions": set(),
            }
        g = groups[group_name]
        g["resource_count"] += 1
        rid = resource.get("resource_id", "")
        viols = vio_by_resource.get(rid, [])
        g["violation_count"] += len(viols)
        g["critical_violations"] += sum(1 for v in viols if v.get("severity") == "CRITICAL")
        g["estimated_monthly_savings"] += savings_by_resource.get(rid, 0)

        rtype = resource.get("resource_type", "Unknown")
        g["resource_types"][rtype] = g["resource_types"].get(rtype, 0) + 1

        region = resource.get("region", "")
        if region:
            g["regions"].add(region)

    # Convert sets to lists and sort
    result_groups = []
    for g in groups.values():
        g["regions"] = sorted(g["regions"])
        g["estimated_monthly_savings"] = round(g["estimated_monthly_savings"], 2)
        g["resource_types"] = [{"type": k, "count": v} for k, v in sorted(g["resource_types"].items(), key=lambda x: -x[1])]
        result_groups.append(g)

    result_groups.sort(key=lambda g: -g["estimated_monthly_savings"])

    total = len(resources)
    untagged = groups.get("Untagged", {}).get("resource_count", 0)
    untagged_pct = round(untagged / total * 100, 1) if total else 0

    return {
        "scan_id": scan_id,
        "groups": result_groups,
        "total_resources": total,
        "total_groups": len(result_groups),
        "untagged_count": untagged,
        "untagged_percentage": untagged_pct,
        "available_tag_keys": sorted({k for r in resources for k in (r.get("tags") or {}).keys()}),
    }
