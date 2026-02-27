"""
Lambda Rules Engine
===================
Rules: LAMBDA-001 (unused), LAMBDA-002 (oversized memory), LAMBDA-003 (no timeout),
       LAMBDA-004 (no DLQ), LAMBDA-005 (no tracing), LAMBDA-006 (missing tags)
"""
from __future__ import annotations
from typing import Any

# Lambda pricing: ~$0.0000166667 per GB-second + $0.20 per 1M requests
_GB_SECOND_PRICE = 0.0000166667
_REQ_PRICE_PER_MILLION = 0.20

def evaluate_lambda_rules(resource: dict[str, Any]) -> list[dict[str, Any]]:
    violations = []
    raw = resource.get("raw_data", {})
    tags = resource.get("tags", {})
    rid = resource["resource_id"]
    name = raw.get("function_name", rid)
    region = resource.get("region", "us-east-1")

    invocations = raw.get("invocations_30d", -1)
    memory_mb = raw.get("memory_mb", 128)
    timeout_sec = raw.get("timeout_sec", 3)
    avg_duration_ms = raw.get("avg_duration_ms", 0)
    last_modified_days = raw.get("last_modified_days", 0)

    # LAMBDA-001: Unused function (0 invocations in 30 days)
    if invocations == 0 and last_modified_days > 30:
        violations.append({
            "rule_id": "LAMBDA-001",
            "severity": "MEDIUM",
            "message": f"Lambda '{name}' has had 0 invocations in 30 days and was last modified {last_modified_days} days ago.",
            "recommendation": "Review if this function is still needed. Delete unused Lambda functions to avoid maintenance overhead.",
            "compliance_framework": "FinOps",
            "resource_id": rid, "resource_type": "Lambda", "region": region,
        })

    # LAMBDA-002: Oversized memory (high memory, low avg duration)
    if memory_mb >= 1024 and avg_duration_ms > 0 and avg_duration_ms < 500 and invocations != 0:
        estimated_monthly_waste = round(
            (memory_mb / 1024) * (avg_duration_ms / 1000) * (invocations or 1000) * _GB_SECOND_PRICE * 30, 2
        )
        violations.append({
            "rule_id": "LAMBDA-002",
            "severity": "MEDIUM",
            "message": f"Lambda '{name}' has {memory_mb}MB memory but avg duration of only {avg_duration_ms}ms — likely over-provisioned.",
            "recommendation": f"Use AWS Lambda Power Tuning to right-size memory. Estimated waste: ~${estimated_monthly_waste}/month.",
            "compliance_framework": "FinOps",
            "resource_id": rid, "resource_type": "Lambda", "region": region,
        })

    # LAMBDA-003: Timeout too long or too short
    if timeout_sec >= 900:
        violations.append({
            "rule_id": "LAMBDA-003",
            "severity": "LOW",
            "message": f"Lambda '{name}' has maximum timeout ({timeout_sec}s). Functions that hang will incur full cost.",
            "recommendation": "Set a realistic timeout based on p99 duration to limit runaway execution costs.",
            "compliance_framework": "FinOps",
            "resource_id": rid, "resource_type": "Lambda", "region": region,
        })
    elif timeout_sec <= 3 and avg_duration_ms > 0 and avg_duration_ms > 2000:
        violations.append({
            "rule_id": "LAMBDA-003",
            "severity": "HIGH",
            "message": f"Lambda '{name}' timeout ({timeout_sec}s) is too low for observed avg duration ({avg_duration_ms}ms) — causing frequent timeouts.",
            "recommendation": "Increase Lambda timeout to at least 3x the p99 execution duration.",
            "compliance_framework": "Governance",
            "resource_id": rid, "resource_type": "Lambda", "region": region,
        })

    # LAMBDA-004: No Dead Letter Queue
    if not raw.get("has_dlq", False) and invocations != 0:
        violations.append({
            "rule_id": "LAMBDA-004",
            "severity": "LOW",
            "message": f"Lambda '{name}' has no Dead Letter Queue (DLQ) configured.",
            "recommendation": "Configure an SQS DLQ or SNS topic to capture failed async invocations.",
            "compliance_framework": "Governance",
            "resource_id": rid, "resource_type": "Lambda", "region": region,
        })

    # LAMBDA-005: No X-Ray tracing
    if not raw.get("tracing_enabled", False) and invocations != 0:
        violations.append({
            "rule_id": "LAMBDA-005",
            "severity": "LOW",
            "message": f"Lambda '{name}' does not have X-Ray active tracing enabled.",
            "recommendation": "Enable X-Ray tracing to identify performance bottlenecks and errors.",
            "compliance_framework": "Governance",
            "resource_id": rid, "resource_type": "Lambda", "region": region,
        })

    # LAMBDA-006: Missing tags
    mandatory_tags = {"Environment", "Owner", "Project"}
    missing = [t for t in mandatory_tags if not tags.get(t)]
    if missing:
        violations.append({
            "rule_id": "LAMBDA-006",
            "severity": "LOW",
            "message": f"Lambda '{name}' missing tags: {', '.join(missing)}.",
            "recommendation": "Apply mandatory tags for cost attribution and ownership tracking.",
            "compliance_framework": "Governance",
            "resource_id": rid, "resource_type": "Lambda", "region": region,
        })

    return violations
