"""
Compliance Scorer
=================
Maps every rule_id to one or more compliance frameworks and computes
per-framework pass/fail scores for a scan's violations.

Supported frameworks:
  CIS-AWS-1.4  — Center for Internet Security AWS Foundations Benchmark v1.4
  SOC2         — SOC 2 Type II (Security/Availability/Confidentiality)
  PCI-DSS      — Payment Card Industry Data Security Standard
  NIST-800-53  — NIST SP 800-53 Security Controls
  FinOps       — Cloud Financial Management best practices
  Governance   — Internal governance / tagging / operational standards
"""
from __future__ import annotations

from typing import Any


# rule_id → list of frameworks it maps to
_RULE_FRAMEWORK_MAP: dict[str, list[str]] = {
    # EC2
    "EC2-001": ["FinOps"],
    "EC2-002": ["FinOps"],
    "EC2-003": ["Governance", "SOC2"],
    "EC2-004": ["CIS-AWS-1.4", "PCI-DSS"],
    "EC2-005": ["FinOps"],
    "EC2-006": ["FinOps", "Governance"],
    "EC2-007": ["FinOps"],
    "EC2-008": ["FinOps"],
    # RDS
    "RDS-001": ["CIS-AWS-1.4", "SOC2", "PCI-DSS"],
    "RDS-002": ["FinOps"],
    "RDS-003": ["Governance"],
    "RDS-004": ["CIS-AWS-1.4", "PCI-DSS", "NIST-800-53"],
    # LB
    "LB-001":  ["FinOps"],
    "LB-002":  ["CIS-AWS-1.4", "PCI-DSS"],
    "LB-003":  ["Governance"],
    # NAT
    "NAT-001": ["FinOps"],
    "NAT-002": ["Governance"],
    # Storage / EBS / S3 / EIP / Snapshot
    "EBS-001": ["FinOps"],
    "EBS-002": ["CIS-AWS-1.4", "SOC2", "PCI-DSS", "NIST-800-53"],
    "EBS-003": ["FinOps"],
    "S3-001":  ["CIS-AWS-1.4", "SOC2", "PCI-DSS", "NIST-800-53"],
    "S3-002":  ["SOC2", "Governance"],
    "S3-003":  ["CIS-AWS-1.4", "SOC2", "PCI-DSS", "NIST-800-53"],
    "S3-004":  ["FinOps", "Governance"],
    "S3-005":  ["FinOps"],
    "EIP-001": ["FinOps"],
    "SNAP-001": ["FinOps", "Governance"],
    # Lambda
    "LAMBDA-001": ["FinOps"],
    "LAMBDA-002": ["FinOps"],
    "LAMBDA-003": ["Governance"],
    "LAMBDA-004": ["Governance", "SOC2"],
    "LAMBDA-005": ["Governance"],
    "LAMBDA-006": ["Governance"],
    # IAM
    "IAM-001": ["CIS-AWS-1.4", "SOC2", "PCI-DSS", "NIST-800-53"],
    "IAM-002": ["CIS-AWS-1.4", "SOC2", "PCI-DSS", "NIST-800-53"],
    "IAM-003": ["CIS-AWS-1.4", "PCI-DSS", "NIST-800-53"],
    "IAM-004": ["CIS-AWS-1.4", "SOC2", "PCI-DSS", "NIST-800-53"],
    "IAM-005": ["CIS-AWS-1.4", "SOC2", "PCI-DSS"],
    "IAM-006": ["CIS-AWS-1.4", "PCI-DSS"],
    # CloudFront
    "CF-001":  ["CIS-AWS-1.4", "PCI-DSS", "NIST-800-53"],
    "CF-002":  ["CIS-AWS-1.4", "PCI-DSS"],
    "CF-003":  ["Governance"],
    "CF-004":  ["FinOps"],
    "CF-005":  ["Governance", "SOC2"],
    # CloudWatch
    "CW-001":  ["FinOps", "Governance"],
    "CW-002":  ["Governance"],
    "CW-003":  ["Governance", "SOC2"],
}

ALL_FRAMEWORKS = ["CIS-AWS-1.4", "SOC2", "PCI-DSS", "NIST-800-53", "FinOps", "Governance"]


def score_compliance(violations: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Given a list of violation dicts, compute per-framework compliance scores.

    Returns:
    {
      "frameworks": {
        "CIS-AWS-1.4": {"pass": 12, "fail": 4, "score": 75.0, "critical_fails": 2},
        ...
      },
      "overall_score": 68.5,
      "total_violations": 18,
      "critical_violations": 3,
    }
    """
    # Count failures per framework (each unique rule_id violation = 1 fail)
    fail_counts: dict[str, set[str]] = {fw: set() for fw in ALL_FRAMEWORKS}
    critical_counts: dict[str, int] = {fw: 0 for fw in ALL_FRAMEWORKS}

    seen_rules: set[str] = set()
    total_violations = len(violations)
    critical_total = 0

    for v in violations:
        rule_id = v.get("rule_id", "")
        severity = v.get("severity", "LOW")
        frameworks = _RULE_FRAMEWORK_MAP.get(rule_id, ["Governance"])

        for fw in frameworks:
            if fw in fail_counts:
                fail_counts[fw].add(rule_id)
                if severity == "CRITICAL":
                    critical_counts[fw] += 1

        if severity == "CRITICAL":
            critical_total += 1
        seen_rules.add(rule_id)

    # Total rules that APPLY to each framework = rules mapped to that framework
    rules_per_fw: dict[str, set[str]] = {fw: set() for fw in ALL_FRAMEWORKS}
    for rule_id, fws in _RULE_FRAMEWORK_MAP.items():
        for fw in fws:
            if fw in rules_per_fw:
                rules_per_fw[fw].add(rule_id)

    framework_scores: dict[str, Any] = {}
    score_values: list[float] = []

    for fw in ALL_FRAMEWORKS:
        total_rules = len(rules_per_fw[fw])
        fails = len(fail_counts[fw])
        passes = total_rules - fails
        score = round((passes / total_rules * 100) if total_rules > 0 else 100.0, 1)
        score_values.append(score)
        framework_scores[fw] = {
            "pass": passes,
            "fail": fails,
            "total": total_rules,
            "score": score,
            "critical_fails": critical_counts[fw],
            "failed_rules": sorted(fail_counts[fw]),
        }

    overall = round(sum(score_values) / len(score_values), 1) if score_values else 100.0

    return {
        "frameworks": framework_scores,
        "overall_score": overall,
        "total_violations": total_violations,
        "critical_violations": critical_total,
        "unique_failing_rules": len(seen_rules),
    }
