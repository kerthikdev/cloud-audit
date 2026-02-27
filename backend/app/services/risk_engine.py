"""
Risk Engine
===========
Computes a 0–100 risk score per resource and an overall scan risk score.

Score factors:
  - CRITICAL violation:   +30 pts
  - HIGH violation:       +15 pts
  - MEDIUM violation:     +8 pts
  - LOW violation:        +3 pts
  - Unencrypted (any):    +20 pts
  - No tags:              +5 pts
  - Resource age > 1yr:   +5 pts
  - Public exposure:      +10 pts (public IP / S3 public access)
Max raw score: capped at 100.
"""
from __future__ import annotations
from typing import Any

_SEV_WEIGHTS = {"CRITICAL": 30, "HIGH": 15, "MEDIUM": 8, "LOW": 3}


def compute_resource_risk(resource: dict[str, Any], violations: list[dict[str, Any]]) -> int:
    """Return a 0–100 risk score for a single resource."""
    score = 0
    raw = resource.get("raw_data", {})
    rtype = resource.get("resource_type", "")
    tags = resource.get("tags", {})

    # Violation severity contribution
    for v in violations:
        if v.get("resource_id") == resource.get("resource_id"):
            score += _SEV_WEIGHTS.get(v.get("severity", "LOW"), 3)

    # Encryption penalty
    encrypted = raw.get("storage_encrypted", raw.get("encrypted", raw.get("encryption_enabled", None)))
    if encrypted is False:
        score += 20

    # Tag penalty
    mandatory_tags = {"Environment", "Owner", "Project"}
    missing_tags = [t for t in mandatory_tags if not tags.get(t)]
    if len(missing_tags) >= 2:
        score += 5

    # Public exposure
    if raw.get("public_ip") and rtype == "EC2":
        score += 10
    if rtype == "S3" and raw.get("public_access_blocked") is False:
        score += 25  # extra weight for public S3

    # Age factor
    age_days = raw.get("age_days", raw.get("launch_days_ago", raw.get("last_modified_days", 0)))
    if age_days and age_days > 365:
        score += 5

    return min(score, 100)


def compute_scan_risk_score(resources: list[dict[str, Any]], violations: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Compute overall scan risk score and per-resource risk scores.

    Returns:
    {
      "overall_risk_score": int (0-100),
      "risk_level": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "SAFE",
      "resource_scores": [{"resource_id": ..., "risk_score": int, "resource_type": ...}],
      "high_risk_count":  int,
    }
    """
    resource_scores = []
    for res in resources:
        rid = res.get("resource_id", "")
        res_violations = [v for v in violations if v.get("resource_id") == rid]
        rs = compute_resource_risk(res, res_violations)
        resource_scores.append({
            "resource_id": rid,
            "resource_type": res.get("resource_type", ""),
            "region": res.get("region", ""),
            "risk_score": rs,
        })

    if not resource_scores:
        return {"overall_risk_score": 0, "risk_level": "SAFE", "resource_scores": [], "high_risk_count": 0}

    avg_score = sum(r["risk_score"] for r in resource_scores) / len(resource_scores)
    max_score = max(r["risk_score"] for r in resource_scores)
    # Weighted: 70% avg, 30% max pressure
    overall = min(int(avg_score * 0.7 + max_score * 0.3), 100)

    if overall >= 70:
        level = "CRITICAL"
    elif overall >= 50:
        level = "HIGH"
    elif overall >= 30:
        level = "MEDIUM"
    elif overall >= 10:
        level = "LOW"
    else:
        level = "SAFE"

    high_risk = sum(1 for r in resource_scores if r["risk_score"] >= 50)

    return {
        "overall_risk_score": overall,
        "risk_level": level,
        "resource_scores": sorted(resource_scores, key=lambda x: x["risk_score"], reverse=True)[:20],
        "high_risk_count": high_risk,
    }
