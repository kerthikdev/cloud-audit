"""
Remediation Engine
==================
Tracks safe, one-click remediations for detected violations.
Supported actions:
  - RELEASE_EIP   : release unassociated Elastic IP
  - DELETE_VOLUME : delete unattached EBS volume
  - SET_RETENTION : set CloudWatch log group retention to 30 days
  - STOP_INSTANCE : stop idle EC2 instance
  - REPORT        : generate action report (always safe)

For mock mode, all actions are simulated.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user
from app.core import store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/remediation", tags=["remediation"])

# In-memory log of executed remediations
_remediation_log: list[dict[str, Any]] = []

# Safe actions that can be auto-executed
SAFE_ACTIONS = {
    "RELEASE_EIP", "DELETE_VOLUME", "SET_RETENTION", "STOP_INSTANCE", "REPORT"
}

# Map rule_id → remediation action metadata
RULE_REMEDIATIONS: dict[str, dict[str, str]] = {
    "EIP-001": {
        "action_type": "RELEASE_EIP",
        "title": "Release Elastic IP",
        "description": "This Elastic IP has no association. Releasing it saves ~$3.60/month.",
        "risk": "LOW",
        "aws_service": "EC2",
    },
    "EBS-001": {
        "action_type": "DELETE_VOLUME",
        "title": "Delete Unattached EBS Volume",
        "description": "This volume is not attached to any instance. Deleting it eliminates ongoing storage charges.",
        "risk": "MEDIUM",
        "aws_service": "EC2",
    },
    "CW-001": {
        "action_type": "SET_RETENTION",
        "title": "Set Log Group Retention (30 days)",
        "description": "Log group has no retention policy and accumulates indefinitely. Setting 30-day retention caps costs.",
        "risk": "LOW",
        "aws_service": "CloudWatch Logs",
    },
    "EC2-001": {
        "action_type": "STOP_INSTANCE",
        "title": "Stop Idle EC2 Instance",
        "description": "This instance has been stopped (not terminated). Verify it isn't needed and terminate to eliminate EBS charges.",
        "risk": "MEDIUM",
        "aws_service": "EC2",
    },
    "EC2-002": {
        "action_type": "STOP_INSTANCE",
        "title": "Stop Low-CPU EC2 Instance",
        "description": "Average CPU < 10% over 14 days indicates the instance is idle. Stop it to save costs.",
        "risk": "MEDIUM",
        "aws_service": "EC2",
    },
}


class RemediateRequest(BaseModel):
    scan_id: str
    resource_id: str
    rule_id: str
    dry_run: bool = True


@router.get("")
async def list_remediations(
    scan_id: str | None = None,
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Returns all available remediations for a given scan (or all scans if scan_id omitted).
    Each item tells the UI: what can be fixed, how risky it is, and estimated savings.
    """
    from app.core.config import get_settings
    cfg = get_settings()

    # Gather all violations that have known remediations
    items = []
    scan_ids = [scan_id] if scan_id else list(store.scan_sessions.keys())

    for sid in scan_ids:
        violations = store.scan_violations.get(sid, [])
        resources_by_id = {
            r["resource_id"]: r
            for r in store.scan_resources.get(sid, [])
        }
        recs = store.scan_recommendations.get(sid, [])
        recs_by_resource = {}
        for rec in recs:
            recs_by_resource.setdefault(rec.get("resource_id", ""), []).append(rec)

        for v in violations:
            rule_id = v.get("rule_id", "")
            if rule_id not in RULE_REMEDIATIONS:
                continue
            meta = RULE_REMEDIATIONS[rule_id]
            rid = v.get("resource_id", "")
            resource = resources_by_id.get(rid, {})
            savings = sum(
                r.get("estimated_monthly_savings", 0)
                for r in recs_by_resource.get(rid, [])
                if r.get("rule_id") == rule_id
            )
            items.append({
                "id": f"{sid[:8]}-{rid[-8:] if len(rid) > 8 else rid}-{rule_id}",
                "scan_id": sid,
                "resource_id": rid,
                "resource_type": v.get("resource_type", ""),
                "resource_name": resource.get("name", rid),
                "region": v.get("region", ""),
                "rule_id": rule_id,
                "severity": v.get("severity", "MEDIUM"),
                "violation_message": v.get("message", ""),
                "action_type": meta["action_type"],
                "title": meta["title"],
                "description": meta["description"],
                "risk": meta["risk"],
                "aws_service": meta["aws_service"],
                "estimated_monthly_savings": round(savings, 2),
                "is_mock": cfg.mock_aws,
                "executed": False,
            })

    # Deduplicate by resource+rule
    seen = set()
    unique = []
    for item in items:
        key = (item["resource_id"], item["rule_id"])
        if key not in seen:
            seen.add(key)
            unique.append(item)

    # Sort by savings desc, then risk
    risk_order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    unique.sort(key=lambda x: (-x["estimated_monthly_savings"], risk_order.get(x["risk"], 1)))

    total_savings = sum(i["estimated_monthly_savings"] for i in unique)
    return {
        "remediations": unique,
        "total": len(unique),
        "total_estimated_savings": round(total_savings, 2),
        "low_risk_count": sum(1 for i in unique if i["risk"] == "LOW"),
        "medium_risk_count": sum(1 for i in unique if i["risk"] == "MEDIUM"),
    }


@router.post("/execute")
async def execute_remediation(
    payload: RemediateRequest,
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Execute (or dry-run) a remediation action.
    In mock mode, action is always simulated.
    In real AWS mode, executes the actual API call.
    """
    from app.core.config import get_settings
    cfg = get_settings()

    if payload.rule_id not in RULE_REMEDIATIONS:
        raise HTTPException(status_code=400, detail=f"No remediation defined for rule {payload.rule_id}")

    meta = RULE_REMEDIATIONS[payload.rule_id]
    action_type = meta["action_type"]
    is_dry_run = payload.dry_run or cfg.mock_aws

    log_entry = {
        "id": str(uuid.uuid4()),
        "executed_at": datetime.utcnow().isoformat(),
        "executed_by": current_user.username,
        "scan_id": payload.scan_id,
        "resource_id": payload.resource_id,
        "rule_id": payload.rule_id,
        "action_type": action_type,
        "dry_run": is_dry_run,
        "status": "simulated" if is_dry_run else "pending",
        "message": "",
    }

    if is_dry_run:
        log_entry["status"] = "simulated"
        log_entry["message"] = f"[DRY RUN] Would execute {action_type} on {payload.resource_id}"
        _remediation_log.append(log_entry)
        return {
            "success": True,
            "dry_run": True,
            "action_type": action_type,
            "message": log_entry["message"],
            "log_id": log_entry["id"],
        }

    # Real AWS execution
    try:
        import boto3
        session = boto3.Session(
            aws_access_key_id=cfg.aws_access_key_id or None,
            aws_secret_access_key=cfg.aws_secret_access_key or None,
            region_name=cfg.aws_region,
        )
        result_msg = _execute_aws_action(session, action_type, payload.resource_id)
        log_entry["status"] = "completed"
        log_entry["message"] = result_msg
        _remediation_log.append(log_entry)
        logger.info(f"Remediation {action_type} executed on {payload.resource_id} by {current_user.username}")
        return {"success": True, "dry_run": False, "action_type": action_type, "message": result_msg, "log_id": log_entry["id"]}
    except Exception as e:
        log_entry["status"] = "failed"
        log_entry["message"] = str(e)
        _remediation_log.append(log_entry)
        raise HTTPException(status_code=500, detail=f"Remediation failed: {e}")


def _execute_aws_action(session: Any, action_type: str, resource_id: str) -> str:
    """Execute actual AWS API call for a remediation action."""
    if action_type == "RELEASE_EIP":
        ec2 = session.client("ec2")
        # resource_id is the public IP or allocation ID
        alloc_id = resource_id if resource_id.startswith("eipalloc-") else None
        if alloc_id:
            ec2.release_address(AllocationId=alloc_id)
        else:
            ec2.release_address(PublicIp=resource_id)
        return f"Released Elastic IP {resource_id}"

    elif action_type == "DELETE_VOLUME":
        ec2 = session.client("ec2")
        ec2.delete_volume(VolumeId=resource_id)
        return f"Deleted EBS volume {resource_id}"

    elif action_type == "SET_RETENTION":
        logs = session.client("logs")
        log_group = resource_id.split("log-group:")[-1].split(":")[-1]
        logs.put_retention_policy(logGroupName=log_group, retentionInDays=30)
        return f"Set 30-day retention on log group {log_group}"

    elif action_type == "STOP_INSTANCE":
        ec2 = session.client("ec2")
        ec2.stop_instances(InstanceIds=[resource_id])
        return f"Stopped EC2 instance {resource_id}"

    return f"Action {action_type} completed for {resource_id}"


@router.get("/log")
async def get_remediation_log(current_user=Depends(get_current_user)) -> dict[str, Any]:
    """Returns the full history of executed remediations."""
    return {
        "log": sorted(_remediation_log, key=lambda x: x.get("executed_at", ""), reverse=True),
        "total": len(_remediation_log),
    }
