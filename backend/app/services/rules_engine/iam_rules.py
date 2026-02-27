"""
IAM Rules Engine
================
Rules: IAM-001 (unused user), IAM-002 (root MFA), IAM-003 (old access keys),
       IAM-004 (wildcard permissions), IAM-005 (root last used recently)
"""
from __future__ import annotations
from typing import Any


def evaluate_iam_rules(resource: dict[str, Any]) -> list[dict[str, Any]]:
    violations = []
    raw = resource.get("raw_data", {})
    rid = resource["resource_id"]
    rtype = resource.get("resource_type", "IAMUser")
    region = resource.get("region", "global")
    uname = raw.get("username", rid)

    is_root = raw.get("is_root", rtype == "IAMRoot")

    if is_root:
        # IAM-002: Root account MFA not enabled
        if not raw.get("has_mfa", True):
            violations.append({
                "rule_id": "IAM-002",
                "severity": "CRITICAL",
                "message": "AWS root account does not have MFA enabled.",
                "recommendation": "Immediately enable MFA for the root account via IAM console → Account settings.",
                "compliance_framework": "CIS-AWS",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

        # IAM-005: Root account used recently (should never be used)
        last_activity = raw.get("last_activity_days", 999)
        if 0 <= last_activity <= 90:
            violations.append({
                "rule_id": "IAM-005",
                "severity": "CRITICAL",
                "message": f"AWS root account was used {last_activity} days ago. Root account should never be used for routine operations.",
                "recommendation": "Create IAM users/roles with least-privilege. Lock root account credentials and enable MFA.",
                "compliance_framework": "CIS-AWS",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })
    else:
        # IAM-001: Unused IAM user (no activity in 90+ days)
        last_activity = raw.get("last_activity_days", 0)
        if last_activity > 90:
            violations.append({
                "rule_id": "IAM-001",
                "severity": "HIGH",
                "message": f"IAM user '{uname}' has had no activity for {last_activity} days.",
                "recommendation": "Disable or delete unused IAM users. Implement periodic access review process.",
                "compliance_framework": "CIS-AWS",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

        # IAM-003: Access key older than 90 days
        key_age = raw.get("key_age_days", 0)
        if key_age > 90:
            violations.append({
                "rule_id": "IAM-003",
                "severity": "HIGH",
                "message": f"IAM user '{uname}' has an access key that is {key_age} days old (exceeds 90-day rotation policy).",
                "recommendation": "Rotate access keys immediately. Automate key rotation using AWS Secrets Manager.",
                "compliance_framework": "CIS-AWS",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

        # IAM-004: Overly permissive (wildcard) policy
        if raw.get("has_wildcard_policy", False):
            violations.append({
                "rule_id": "IAM-004",
                "severity": "CRITICAL",
                "message": f"IAM user '{uname}' has a policy with wildcard (*) Action — full admin access.",
                "recommendation": "Apply least-privilege: replace wildcard policies with specific resource/action permissions.",
                "compliance_framework": "CIS-AWS",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

        # IAM-006: Console access without MFA
        if raw.get("has_console_access", False) and not raw.get("has_mfa", True):
            violations.append({
                "rule_id": "IAM-006",
                "severity": "HIGH",
                "message": f"IAM user '{uname}' has console access but MFA is not enabled.",
                "recommendation": "Enforce MFA for all IAM users with console access via IAM policy condition.",
                "compliance_framework": "CIS-AWS",
                "resource_id": rid, "resource_type": rtype, "region": region,
            })

    return violations
