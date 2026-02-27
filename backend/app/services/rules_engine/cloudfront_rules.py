"""
CloudFront Rules Engine
========================
Rules: CF-001 (no WAF), CF-002 (HTTP allowed), CF-003 (no geo-restriction),
       CF-004 (idle distribution), CF-005 (no logging)
"""
from __future__ import annotations
from typing import Any


def evaluate_cloudfront_rules(resource: dict[str, Any]) -> list[dict[str, Any]]:
    violations = []
    raw = resource.get("raw_data", {})
    rid = resource["resource_id"]
    domain = raw.get("domain_name", rid)
    region = resource.get("region", "global")

    requests_30d = raw.get("requests_30d", -1)

    # CF-001: No WAF attached
    if not raw.get("has_waf", False):
        violations.append({
            "rule_id": "CF-001",
            "severity": "HIGH",
            "message": f"CloudFront distribution '{domain}' does not have a WAF (Web ACL) attached.",
            "recommendation": "Attach an AWS WAF Web ACL to protect against common web attacks (SQLi, XSS, L7 DDoS).",
            "compliance_framework": "CIS-AWS",
            "resource_id": rid, "resource_type": "CloudFront", "region": region,
        })

    # CF-002: HTTP allowed (should be HTTPS-only)
    if not raw.get("https_only", True):
        violations.append({
            "rule_id": "CF-002",
            "severity": "HIGH",
            "message": f"CloudFront distribution '{domain}' allows HTTP traffic — data is transmitted in plaintext.",
            "recommendation": "Set Viewer Protocol Policy to 'Redirect HTTP to HTTPS' or 'HTTPS Only'.",
            "compliance_framework": "CIS-AWS",
            "resource_id": rid, "resource_type": "CloudFront", "region": region,
        })

    # CF-003: No geo-restriction
    if not raw.get("has_geo_restriction", False):
        violations.append({
            "rule_id": "CF-003",
            "severity": "LOW",
            "message": f"CloudFront distribution '{domain}' has no geo-restriction configured.",
            "recommendation": "Consider adding geo-restriction if your service is not intended for all geographies.",
            "compliance_framework": "Governance",
            "resource_id": rid, "resource_type": "CloudFront", "region": region,
        })

    # CF-004: Idle distribution (0 requests in 30 days)
    if requests_30d == 0:
        violations.append({
            "rule_id": "CF-004",
            "severity": "MEDIUM",
            "message": f"CloudFront distribution '{domain}' has had 0 requests in the last 30 days — may be idle.",
            "recommendation": "Review if this distribution is still needed. Disable or delete if unused to avoid baseline costs.",
            "compliance_framework": "FinOps",
            "resource_id": rid, "resource_type": "CloudFront", "region": region,
        })

    # CF-005: No access logging
    if not raw.get("logging_enabled", False):
        violations.append({
            "rule_id": "CF-005",
            "severity": "LOW",
            "message": f"CloudFront distribution '{domain}' does not have access logging enabled.",
            "recommendation": "Enable CloudFront access logs delivered to an S3 bucket for audit and threat detection.",
            "compliance_framework": "Governance",
            "resource_id": rid, "resource_type": "CloudFront", "region": region,
        })

    return violations


def evaluate_cloudwatch_rules(resource: dict[str, Any]) -> list[dict[str, Any]]:
    violations = []
    raw = resource.get("raw_data", {})
    rid = resource["resource_id"]
    rtype = resource.get("resource_type", "")
    region = resource.get("region", "us-east-1")

    if rtype == "LogGroup":
        name = raw.get("log_group_name", rid)
        size_mb = raw.get("size_mb", 0)

        # CW-001: No retention policy — unbounded log storage cost
        if not raw.get("has_retention", False):
            cost_est = round(size_mb / 1024 * 0.03 * 12, 2)  # $0.03/GB/month annualized
            violations.append({
                "rule_id": "CW-001",
                "severity": "MEDIUM",
                "message": f"Log group '{name}' has no retention policy. Current size: {size_mb}MB. Logs accumulate indefinitely.",
                "recommendation": f"Set a retention policy (7–90 days). Estimated annual savings: ~${cost_est}.",
                "compliance_framework": "FinOps",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

    elif rtype == "CloudWatchAlarm":
        name = raw.get("alarm_name", rid)
        state = raw.get("state", "OK")
        last_change = raw.get("last_state_change_days", 0)

        # CW-002: Alarm stuck in INSUFFICIENT_DATA
        if state == "INSUFFICIENT_DATA" and last_change > 7:
            violations.append({
                "rule_id": "CW-002",
                "severity": "HIGH",
                "message": f"Alarm '{name}' has been in INSUFFICIENT_DATA state for {last_change} days — metric may be misconfigured.",
                "recommendation": "Review alarm configuration: verify metric namespace, dimensions, and data availability.",
                "compliance_framework": "Governance",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

        # CW-003: Alarm has no actions
        if not raw.get("has_actions", True):
            violations.append({
                "rule_id": "CW-003",
                "severity": "LOW",
                "message": f"Alarm '{name}' has no actions configured — alerts will never be sent.",
                "recommendation": "Add SNS notification or Auto Scaling action to the alarm so it triggers on state change.",
                "compliance_framework": "Governance",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

    return violations
