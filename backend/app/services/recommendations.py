"""
Recommendations Engine
======================
Transforms detected violations into ranked, dollar-estimated savings actions.

Output shape per recommendation:
{
    "id":                    str,         # unique UUID
    "scan_id":               str,
    "category":              str,         # Compute | Storage | Database | Network | Governance
    "rule_id":               str,         # e.g. "EC2-002"
    "resource_id":           str,
    "resource_type":         str,
    "region":                str,
    "title":                 str,         # short action title
    "description":           str,         # 1-2 sentence context
    "action":                str,         # concrete next step
    "estimated_monthly_savings": float,  # USD
    "confidence":            str,         # HIGH | MEDIUM | LOW
    "severity":              str,         # from the originating violation
}
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

# Load real EC2 on-demand pricing (us-east-1 hourly rates)
_PRICING_FILE = Path(__file__).parent.parent / "data" / "ec2_pricing.json"
try:
    _EC2_PRICES: dict[str, dict[str, float]] = json.loads(_PRICING_FILE.read_text())
except Exception:
    _EC2_PRICES = {}

_FALLBACK_HOURLY = 0.10  # used when instance type not in pricing table


def _ec2_hourly(instance_type: str, region: str = "us-east-1") -> float:
    """Return hourly on-demand price for an EC2 instance type."""
    region_prices = _EC2_PRICES.get(region, _EC2_PRICES.get("us-east-1", {}))
    return region_prices.get(instance_type, _FALLBACK_HOURLY)

# ---------------------------------------------------------------------------
# Rule metadata: rule_id → (category, title, description, action, confidence)
# ---------------------------------------------------------------------------
_RULE_META: dict[str, dict[str, str]] = {
    # EC2
    "EC2-001": {
        "category":    "Compute",
        "title":       "Terminate stopped EC2 instance",
        "description": "Stopped EC2 instances still accrue EBS volume charges. "
                       "If this instance has been stopped intentionally, verify it is no longer needed.",
        "action":      "Create an AMI snapshot if needed, then terminate the instance.",
        "confidence":  "HIGH",
    },
    "EC2-002": {
        "category":    "Compute",
        "title":       "Rightsize or stop idle EC2 instance",
        "description": "Instance has averaged < 5% CPU over 7 days — it is effectively idle.",
        "action":      "Stop the instance if unused, or rightsize to a smaller type within the same family.",
        "confidence":  "HIGH",
    },
    "EC2-003": {
        "category":    "Governance",
        "title":       "Apply mandatory tags to EC2 instance",
        "description": "Missing Environment, Owner, or Project tags prevent cost attribution and ownership tracking.",
        "action":      "Apply mandatory tags via AWS Console, CLI, or enforce via SCP/Config rules.",
        "confidence":  "HIGH",
    },
    "EC2-004": {
        "category":    "Governance",
        "title":       "Remove public IP from EC2 instance",
        "description": "EC2 instance has a public IP address assigned without apparent need.",
        "action":      "Review security group rules and use a load balancer or VPN instead of a direct public IP.",
        "confidence":  "MEDIUM",
    },
    "EC2-005": {
        "category":    "Compute",
        "title":       "Rightsize oversized EC2 instance",
        "description": "Instance type is one size larger than needed based on sustained low CPU utilization.",
        "action":      "Change instance type to the next smaller size in the same family (live resize for t3/m5/c5).",
        "confidence":  "HIGH",
    },
    "EC2-006": {
        "category":    "Compute",
        "title":       "Move EC2 instance to Auto Scaling Group",
        "description": "Standalone On-Demand instance has no automatic recovery or scale-in. "
                       "ASGs prevent idle over-spend on low-traffic periods.",
        "action":      "Create a launch template and ASG; migrate instance. Enables Spot/Mixed capacity.",
        "confidence":  "MEDIUM",
    },
    "EC2-007": {
        "category":    "Compute",
        "title":       "Switch to Spot pricing for eligible EC2 instance",
        "description": "Instance family supports Spot pricing at 60–70% savings for stateless workloads.",
        "action":      "Convert to Spot instance or use an ASG with Spot/On-Demand capacity mix.",
        "confidence":  "MEDIUM",
    },
    "EC2-008": {
        "category":    "Compute",
        "title":       "Purchase Reserved Instance for long-running EC2",
        "description": "Instance has been running continuously as On-Demand for > 30 days.",
        "action":      "Purchase a 1-year Convertible RI via AWS Cost Explorer RI recommendations.",
        "confidence":  "MEDIUM",
    },
    # EBS
    "EBS-001": {
        "category":    "Storage",
        "title":       "Delete unattached EBS volume",
        "description": "Volume is not attached to any instance and accumulating charges at $0.10/GB/month.",
        "action":      "Take a final snapshot if needed, then delete the volume.",
        "confidence":  "HIGH",
    },
    "EBS-002": {
        "category":    "Governance",
        "title":       "Enable encryption on EBS volume",
        "description": "Unencrypted EBS volume violates encryption-at-rest policy.",
        "action":      "Create an encrypted snapshot and restore to a new encrypted volume.",
        "confidence":  "HIGH",
    },
    "EBS-003": {
        "category":    "Storage",
        "title":       "Migrate gp2 EBS volume to gp3",
        "description": "gp3 volumes deliver the same baseline IOPS as gp2 at ~20% lower cost.",
        "action":      "Use AWS Console or CLI to modify volume type from gp2 to gp3 (zero downtime).",
        "confidence":  "HIGH",
    },
    # S3
    "S3-001": {
        "category":    "Governance",
        "title":       "Block public access on S3 bucket",
        "description": "Bucket does not have all Block Public Access settings enabled — data may be exposed.",
        "action":      "Enable all four Block Public Access settings on the bucket and at the account level.",
        "confidence":  "HIGH",
    },
    "S3-002": {
        "category":    "Storage",
        "title":       "Enable S3 versioning",
        "description": "Bucket versioning is disabled — accidental deletes or overwrites are not recoverable.",
        "action":      "Enable versioning and configure a lifecycle rule to expire old versions after 30–90 days.",
        "confidence":  "MEDIUM",
    },
    "S3-003": {
        "category":    "Storage",
        "title":       "Add S3 lifecycle policy to control storage growth",
        "description": "Bucket has no lifecycle policy — objects accumulate indefinitely at Standard tier pricing.",
        "action":      "Add a lifecycle rule to transition objects to Intelligent-Tiering or Glacier after 30+ days.",
        "confidence":  "HIGH",
    },
    "S3-004": {
        "category":    "Storage",
        "title":       "Remove or archive idle S3 bucket",
        "description": "Bucket has had no CloudWatch activity for 90+ days.",
        "action":      "Verify the bucket is unused, archive contents to Glacier if needed, then delete.",
        "confidence":  "MEDIUM",
    },
    # EIP
    "EIP-001": {
        "category":    "Network",
        "title":       "Release unassociated Elastic IP",
        "description": "Unassociated EIPs are billed at ~$3.60/month per address.",
        "action":      "Release the Elastic IP address if no longer needed.",
        "confidence":  "HIGH",
    },
    # Snapshots
    "SNAPSHOT-001": {
        "category":    "Storage",
        "title":       "Delete orphaned EBS snapshot",
        "description": "Snapshot is older than 30 days and has no associated AMI.",
        "action":      "Delete the snapshot if no longer required for backup or recovery.",
        "confidence":  "MEDIUM",
    },
    # Load Balancers
    "LB-001": {
        "category":    "Network",
        "title":       "Review low-traffic load balancer",
        "description": "Load balancer has fewer than 10 requests/day — may be unused.",
        "action":      "Verify target group membership and delete the LB if no longer serving traffic.",
        "confidence":  "MEDIUM",
    },
    "LB-002": {
        "category":    "Network",
        "title":       "Delete orphaned load balancer (zero listeners)",
        "description": "Load balancer has no listeners — it is serving no traffic.",
        "action":      "Delete this load balancer immediately to stop fixed hourly charges.",
        "confidence":  "HIGH",
    },
    # NAT Gateway
    "NAT-001": {
        "category":    "Network",
        "title":       "Remove or replace low-utilization NAT Gateway",
        "description": "NAT Gateway transferred < 1 GB over 7 days — extremely low for ~$32.40/month fixed cost.",
        "action":      "Replace with VPC Endpoint (free for S3/DynamoDB) or remove if outbound internet not needed.",
        "confidence":  "HIGH",
    },
    # RDS
    "RDS-001": {
        "category":    "Database",
        "title":       "Stop or remove idle RDS instance",
        "description": "RDS instance had fewer than 5 connections over 7 days — likely unused.",
        "action":      "Stop the instance (saves compute cost) or take a final snapshot and delete.",
        "confidence":  "HIGH",
    },
    "RDS-002": {
        "category":    "Database",
        "title":       "Downsize over-provisioned RDS instance",
        "description": "Large RDS class running with < 20% CPU — significantly over-provisioned.",
        "action":      "Use blue/green deployment to resize to the next smaller instance class, saving ~50%.",
        "confidence":  "HIGH",
    },
    "RDS-003": {
        "category":    "Database",
        "title":       "Enable RDS storage autoscaling",
        "description": "Storage autoscaling is disabled — manual expansion required when disk fills.",
        "action":      "Set MaxAllocatedStorage on the RDS instance to enable transparent autoscaling.",
        "confidence":  "HIGH",
    },

    # ── Lambda ────────────────────────────────────────────────────────────
    "LAMBDA-001": {
        "category":    "Serverless",
        "title":       "Delete or archive unused Lambda function",
        "description": "Lambda function has had 0 invocations in 30 days — likely orphaned.",
        "action":      "Confirm the function is no longer needed, then delete or archive it to remove maintenance surface.",
        "confidence":  "MEDIUM",
    },
    "LAMBDA-002": {
        "category":    "Serverless",
        "title":       "Right-size Lambda memory allocation",
        "description": "High memory allocated for a function with very short average execution duration — over-provisioned.",
        "action":      "Run AWS Lambda Power Tuning Step Functions workflow to find the optimal memory setting.",
        "confidence":  "HIGH",
    },
    "LAMBDA-003": {
        "category":    "Serverless",
        "title":       "Fix Lambda timeout configuration",
        "description": "Lambda timeout is either too high (runaway cost) or too low (causing failures).",
        "action":      "Set timeout to 3× the p99 execution duration to balance cost and reliability.",
        "confidence":  "MEDIUM",
    },
    "LAMBDA-004": {
        "category":    "Governance",
        "title":       "Add Dead Letter Queue to Lambda",
        "description": "No DLQ configured — async invocation failures are silently dropped.",
        "action":      "Create an SQS DLQ and set it as the function's dead letter configuration.",
        "confidence":  "HIGH",
    },
    "LAMBDA-005": {
        "category":    "Governance",
        "title":       "Enable X-Ray tracing on Lambda",
        "description": "Active tracing not enabled — no visibility into Lambda execution paths.",
        "action":      "Set TracingConfig.Mode = Active in the Lambda configuration.",
        "confidence":  "HIGH",
    },
    "LAMBDA-006": {
        "category":    "Governance",
        "title":       "Tag Lambda function",
        "description": "Missing mandatory tags (Environment/Owner/Project) — prevents cost allocation.",
        "action":      "Apply mandatory tags via Lambda console or IaC.",
        "confidence":  "HIGH",
    },

    # ── IAM ───────────────────────────────────────────────────────────────
    "IAM-001": {
        "category":    "Security",
        "title":       "Disable or delete unused IAM user",
        "description": "IAM user has had no activity for over 90 days — violates CIS benchmark.",
        "action":      "Disable console access and deactivate access keys. Delete after 30-day review period.",
        "confidence":  "HIGH",
    },
    "IAM-002": {
        "category":    "Security",
        "title":       "Enable MFA on root account immediately",
        "description": "AWS root account lacks MFA — critical security control.",
        "action":      "Log into AWS console as root → Security Credentials → Enable MFA device.",
        "confidence":  "HIGH",
    },
    "IAM-003": {
        "category":    "Security",
        "title":       "Rotate IAM access key (>90 days old)",
        "description": "Access key exceeds the 90-day rotation policy — risk of compromise.",
        "action":      "Create a new key, update all systems using it, then deactivate and delete the old key.",
        "confidence":  "HIGH",
    },
    "IAM-004": {
        "category":    "Security",
        "title":       "Remove wildcard (*) IAM policy",
        "description": "User has a policy granting full Admin access (Action: *) — violates least privilege.",
        "action":      "Replace with specific action-level permissions. Use IAM Access Analyzer to generate least-privilege policy.",
        "confidence":  "HIGH",
    },
    "IAM-005": {
        "category":    "Security",
        "title":       "Stop using root account for operations",
        "description": "Root account has been used recently — it should never be used for routine tasks.",
        "action":      "Create IAM admin users/roles, enable SCPs in AWS Organizations to restrict root, lock root credentials.",
        "confidence":  "HIGH",
    },
    "IAM-006": {
        "category":    "Security",
        "title":       "Enforce MFA for console users",
        "description": "IAM user has console access but no MFA — vulnerable to credential theft.",
        "action":      "Attach an IAM policy requiring MFA (Condition: aws:MultiFactorAuthPresent = true).",
        "confidence":  "HIGH",
    },

    # ── CloudFront ────────────────────────────────────────────────────────
    "CF-001": {
        "category":    "Security",
        "title":       "Attach WAF to CloudFront distribution",
        "description": "CloudFront distribution has no WAF — exposed to SQLi, XSS, L7 DDoS.",
        "action":      "Create or attach an AWS WAF Web ACL. Use AWS managed rules for coverage.",
        "confidence":  "HIGH",
    },
    "CF-002": {
        "category":    "Security",
        "title":       "Enforce HTTPS-only on CloudFront",
        "description": "Distribution allows HTTP traffic — data in transit is unencrypted.",
        "action":      "Set Viewer Protocol Policy to 'HTTPS Only' or 'Redirect HTTP to HTTPS'.",
        "confidence":  "HIGH",
    },
    "CF-003": {
        "category":    "Governance",
        "title":       "Review CloudFront geo-restriction policy",
        "description": "No geo-restriction configured — consider restricting to intended markets.",
        "action":      "Add a whitelist or blacklist of countries in the CloudFront distribution geo-restriction settings.",
        "confidence":  "LOW",
    },
    "CF-004": {
        "category":    "Cost",
        "title":       "Remove or disable idle CloudFront distribution",
        "description": "Distribution had 0 requests in 30 days — likely unused.",
        "action":      "Disable or delete the CloudFront distribution if no longer needed.",
        "confidence":  "MEDIUM",
    },
    "CF-005": {
        "category":    "Governance",
        "title":       "Enable CloudFront access logging",
        "description": "Access logs not enabled — no audit trail for requests.",
        "action":      "Configure access logs to an S3 bucket in the CloudFront distribution settings.",
        "confidence":  "HIGH",
    },

    # ── CloudWatch ────────────────────────────────────────────────────────
    "CW-001": {
        "category":    "Cost",
        "title":       "Set CloudWatch log group retention policy",
        "description": "Log group has no retention — logs accumulate indefinitely, increasing storage costs.",
        "action":      "Set retention to 7–90 days depending on compliance requirements. Use Lifecycle policies for archival.",
        "confidence":  "HIGH",
    },
    "CW-002": {
        "category":    "Governance",
        "title":       "Fix misconfigured CloudWatch alarm",
        "description": "Alarm stuck in INSUFFICIENT_DATA — metric source may be missing or misconfigured.",
        "action":      "Verify metric namespace, dimensions, and data availability. Update or delete the alarm.",
        "confidence":  "HIGH",
    },
    "CW-003": {
        "category":    "Governance",
        "title":       "Add actions to CloudWatch alarm",
        "description": "Alarm has no actions — it fires silently without notifying anyone.",
        "action":      "Add an SNS notification or Auto Scaling action to the alarm.",
        "confidence":  "HIGH",
    },
}

# ---------------------------------------------------------------------------
# Savings formulas: rule_id → function(resource_raw_data) → float (USD/month)
# ---------------------------------------------------------------------------
def _savings(rule_id: str, raw: dict[str, Any]) -> float:
    """Estimate monthly savings in USD using real instance pricing where available."""
    r = rule_id
    itype = raw.get("instance_type", "")
    region = raw.get("region", "us-east-1")
    hourly = _ec2_hourly(itype, region) if itype else _FALLBACK_HOURLY
    monthly = hourly * 730  # hours in a month

    if r == "EC2-001":
        # Stopped instance still pays for EBS. Estimate 50 GB gp3.
        ebs_cost = round(50 * 0.08, 2)   # $0.08/GB-month for gp3
        return ebs_cost

    if r == "EC2-002":
        # Idle instance — 70% savings from stop/rightsize
        return round(monthly * 0.70, 2)

    if r == "EC2-005":
        # Rightsize one size down = ~50% compute cost reduction
        return round(monthly * 0.50, 2)

    if r == "EC2-007":
        # Spot pricing saves ~65% over On-Demand
        return round(monthly * 0.65, 2)

    if r == "EC2-008":
        # 1-yr Convertible RI saves ~35% over On-Demand
        return round(monthly * 0.35, 2)

    if r == "EBS-001":
        size_gb = raw.get("size_gb", 20)
        return round(size_gb * 0.10, 2)   # gp2 price

    if r == "EBS-003":
        size_gb = raw.get("size_gb", 50)
        return round(size_gb * 0.10 * 0.20, 2)   # gp3 is ~20% cheaper than gp2

    if r == "EIP-001":
        return 3.60   # $0.005/hr × 720 hr

    if r == "SNAPSHOT-001":
        size_gb = raw.get("size_gb", 10)
        return round(size_gb * 0.05, 2)   # EBS snapshot storage price

    if r == "LB-002":
        return 22.0   # Idle ALB fixed charge

    if r == "LB-001":
        return 16.0   # Low-traffic NLB

    if r == "NAT-001":
        return 32.40  # NAT Gateway fixed hourly charge

    if r == "RDS-001":
        return 100.0  # Idle RDS — stopping saves full compute

    if r == "RDS-002":
        return 120.0  # Rightsizing RDS saves ~50%

    if r in ("EC2-003", "EC2-004", "EC2-006",
             "EBS-002", "S3-001", "S3-002", "S3-003", "S3-004",
             "RDS-003"):
        return 0.0  # Governance rules — no direct monetary savings

    # Lambda savings
    if r == "LAMBDA-001":
        return 0.0   # Orphaned function — no runtime cost, but frees cognitive load
    if r == "LAMBDA-002":
        # Over-provisioned memory — estimate 30% savings from right-sizing
        memory_mb = raw.get("memory_mb", 256)
        invocations = max(raw.get("invocations_30d", 1000), 1)
        avg_ms = raw.get("avg_duration_ms", 500)
        gb_sec = (memory_mb / 1024) * (avg_ms / 1000) * invocations
        return round(gb_sec * 0.0000166667 * 0.30, 2)

    # IAM / security rules — no direct monetary savings
    if r in ("IAM-001", "IAM-002", "IAM-003", "IAM-004", "IAM-005", "IAM-006"):
        return 0.0

    # CloudFront rules
    if r == "CF-004":  # Idle distribution — baseline data transfer cost
        return 2.0    # Minimal, mostly saves operational overhead

    # CloudWatch — log retention savings
    if r == "CW-001":
        size_mb = raw.get("size_mb", 0)
        return round(size_mb / 1024 * 0.03, 2)   # $0.03/GB/month × stored GB

    # Security/governance rules — no direct monetary savings
    if r in ("CF-001", "CF-002", "CF-003", "CF-005",
             "CW-002", "CW-003", "LAMBDA-003", "LAMBDA-004", "LAMBDA-005", "LAMBDA-006"):
        return 0.0

    return 0.0


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------
def generate_recommendations(
    scan_id: str,
    violations: list[dict[str, Any]],
    resources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Convert violations into ranked recommendations.

    - One recommendation per violation
    - Enriched with resource raw_data for accurate savings formulas
    - Sorted descending by estimated_monthly_savings
    """
    # Build resource lookup for raw_data access
    resource_map: dict[str, dict[str, Any]] = {
        r["resource_id"]: r for r in resources
    }

    recommendations: list[dict[str, Any]] = []

    for v in violations:
        rule_id = v.get("rule_id", "")
        meta = _RULE_META.get(rule_id)
        if not meta:
            continue  # Unknown or unmapped rule — skip

        resource_id = v.get("resource_id", "")
        resource = resource_map.get(resource_id, {})
        raw = resource.get("raw_data", {})

        savings = _savings(rule_id, raw)

        recommendations.append({
            "id":                        str(uuid.uuid4()),
            "scan_id":                   scan_id,
            "category":                  meta["category"],
            "rule_id":                   rule_id,
            "resource_id":               resource_id,
            "resource_type":             v.get("resource_type", ""),
            "region":                    v.get("region", ""),
            "title":                     meta["title"],
            "description":               meta["description"],
            "action":                    meta["action"],
            "estimated_monthly_savings": savings,
            "confidence":                meta["confidence"],
            "severity":                  v.get("severity", "LOW"),
        })

    # Sort: highest savings first, then by severity within zero-savings items
    _sev_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    recommendations.sort(
        key=lambda r: (
            -r["estimated_monthly_savings"],
            _sev_order.get(r["severity"].upper(), 4),
        )
    )

    return recommendations
