"""
Scan Diff API
=============
Compare two scan sessions to show what changed:
- New resources (appeared in scan B, not in scan A)
- Removed resources (were in scan A, gone in scan B)
- New violations, fixed violations
- Resource state changes
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.security import get_current_user
from app.core import store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scans/diff", tags=["diff"])


def _resource_key(r: dict[str, Any]) -> str:
    """Use resource_id as the stable key across scans."""
    return r.get("resource_id", "")


@router.get("")
async def scan_diff(
    scan_a: str = Query(..., description="Older scan ID (baseline)"),
    scan_b: str = Query(..., description="Newer scan ID (comparison)"),
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Compare two scans. Returns added/removed resources, new/fixed violations,
    and a summary of changes between the two scans.
    """
    # Validate both scans exist
    sess_a = store.scan_sessions.get(scan_a)
    sess_b = store.scan_sessions.get(scan_b)
    if not sess_a:
        raise HTTPException(status_code=404, detail=f"Scan {scan_a[:8]} not found")
    if not sess_b:
        raise HTTPException(status_code=404, detail=f"Scan {scan_b[:8]} not found")

    res_a = {_resource_key(r): r for r in store.scan_resources.get(scan_a, [])}
    res_b = {_resource_key(r): r for r in store.scan_resources.get(scan_b, [])}

    vio_a = {v.get("resource_id", "") + v.get("rule_id", ""): v
             for v in store.scan_violations.get(scan_a, [])}
    vio_b = {v.get("resource_id", "") + v.get("rule_id", ""): v
             for v in store.scan_violations.get(scan_b, [])}

    keys_a, keys_b = set(res_a), set(res_b)
    vkeys_a, vkeys_b = set(vio_a), set(vio_b)

    added_resources = [res_b[k] for k in (keys_b - keys_a)]
    removed_resources = [res_a[k] for k in (keys_a - keys_b)]

    # State changes for resources present in both scans
    state_changes = []
    for k in keys_a & keys_b:
        old_state = res_a[k].get("state", "")
        new_state = res_b[k].get("state", "")
        if old_state != new_state:
            state_changes.append({
                "resource_id": k,
                "resource_type": res_b[k].get("resource_type", ""),
                "name": res_b[k].get("name", k),
                "region": res_b[k].get("region", ""),
                "old_state": old_state,
                "new_state": new_state,
            })

    new_violations = [vio_b[k] for k in (vkeys_b - vkeys_a)]
    fixed_violations = [vio_a[k] for k in (vkeys_a - vkeys_b)]

    # Risk change per resource type
    type_changes: dict[str, dict[str, int]] = {}
    for r in added_resources:
        t = r.get("resource_type", "Unknown")
        type_changes.setdefault(t, {"added": 0, "removed": 0})
        type_changes[t]["added"] += 1
    for r in removed_resources:
        t = r.get("resource_type", "Unknown")
        type_changes.setdefault(t, {"added": 0, "removed": 0})
        type_changes[t]["removed"] += 1

    # Waste delta
    recs_a = store.scan_recommendations.get(scan_a, [])
    recs_b = store.scan_recommendations.get(scan_b, [])
    waste_a = sum(r.get("estimated_monthly_savings", 0) for r in recs_a)
    waste_b = sum(r.get("estimated_monthly_savings", 0) for r in recs_b)

    return {
        "scan_a": {
            "id": scan_a,
            "started_at": sess_a.get("started_at"),
            "resource_count": len(res_a),
            "violation_count": len(vio_a),
            "regions": sess_a.get("regions", []),
        },
        "scan_b": {
            "id": scan_b,
            "started_at": sess_b.get("started_at"),
            "resource_count": len(res_b),
            "violation_count": len(vio_b),
            "regions": sess_b.get("regions", []),
        },
        "summary": {
            "resources_added": len(added_resources),
            "resources_removed": len(removed_resources),
            "state_changes": len(state_changes),
            "new_violations": len(new_violations),
            "fixed_violations": len(fixed_violations),
            "waste_delta": round(waste_b - waste_a, 2),
            "net_violation_change": len(new_violations) - len(fixed_violations),
        },
        "added_resources": sorted(added_resources, key=lambda r: r.get("resource_type", ""))[:100],
        "removed_resources": sorted(removed_resources, key=lambda r: r.get("resource_type", ""))[:100],
        "state_changes": sorted(state_changes, key=lambda r: r.get("resource_type", ""))[:100],
        "new_violations": sorted(new_violations, key=lambda v: v.get("severity", ""))[:100],
        "fixed_violations": sorted(fixed_violations, key=lambda v: v.get("severity", ""))[:100],
        "type_changes": [{"type": k, **v} for k, v in type_changes.items()],
    }
