"""
VPC Rules Engine — governance rules for VPC resources.

Rules:
  VPC-001  Default VPC still in use (security risk)
  VPC-002  VPC Flow Logs disabled (blind to network traffic)
  VPC-003  VPC has no subnets
  VPC-004  All subnets are public (no private/isolated tier)
  VPC-005  Oversized CIDR /8 or /12 (wasteful IP planning)
  VPC-006  No VPC Endpoints (traffic to S3/DynamoDB goes via IGW — cost & security)
  VPC-007  No NAT Gateway but has private subnets
  VPC-008  Internet Gateway present but no public subnets (misconfiguration)
  VPC-009  Missing required tags (Environment, Owner)
"""
from __future__ import annotations

import ipaddress
from typing import Any


def _violation(
    rule_id: str,
    severity: str,
    message: str,
    recommendation: str,
    resource: dict[str, Any],
    framework: str = "CIS-AWS",
) -> dict[str, Any]:
    return {
        "rule_id":               rule_id,
        "severity":              severity,
        "message":               message,
        "recommendation":        recommendation,
        "remediation":           recommendation,
        "compliance_framework":  framework,
        "resource_id":           resource["resource_id"],
        "resource_type":         "VPC",
        "region":                resource["region"],
    }


def evaluate_vpc_rules(resource: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Evaluate a single VPC resource dict against all VPC governance rules.
    Returns a list of violation dicts (empty = clean).
    """
    violations: list[dict[str, Any]] = []
    raw  = resource.get("raw_data", {})
    tags = resource.get("tags", {})

    # ── VPC-001: Default VPC in use ───────────────────────────────────────────
    if raw.get("is_default"):
        violations.append(_violation(
            "VPC-001", "MEDIUM",
            f"Default VPC ({resource['resource_id']}) is in use in {resource['region']}. "
            "Default VPCs have broad public subnets and no flow logs by default.",
            "Create a custom VPC with private subnets, delete or stop using the default VPC.",
            resource,
        ))

    # ── VPC-002: Flow Logs disabled ────────────────────────────────────────────
    if not raw.get("flow_logs_enabled", False):
        violations.append(_violation(
            "VPC-002", "HIGH",
            f"VPC {resource['resource_id']} has no active Flow Logs. "
            "You cannot detect unusual traffic, DDoS, or lateral movement without them.",
            "Enable VPC Flow Logs (send to CloudWatch Logs or S3). "
            "Costs ~$0.50/GB — use sampling if cost is a concern.",
            resource,
        ))

    # ── VPC-003: No subnets ────────────────────────────────────────────────────
    if raw.get("subnet_count", 0) == 0:
        violations.append(_violation(
            "VPC-003", "LOW",
            f"VPC {resource['resource_id']} has no subnets. It cannot host any resources.",
            "Either create subnets or delete this empty VPC to reduce management overhead.",
            resource,
        ))

    # ── VPC-004: All subnets are public ───────────────────────────────────────
    subnet_count  = raw.get("subnet_count", 0)
    public_count  = raw.get("public_subnet_count", 0)
    private_count = raw.get("private_subnet_count", 0)
    if subnet_count > 0 and private_count == 0 and public_count > 0:
        violations.append(_violation(
            "VPC-004", "HIGH",
            f"VPC {resource['resource_id']} has {public_count} public subnet(s) and zero private subnets. "
            "Workloads in public subnets are directly routable from the internet.",
            "Introduce private subnets for application/database tiers. "
            "Reserve public subnets only for load balancers.",
            resource,
            framework="CIS-AWS",
        ))

    # ── VPC-005: Oversized CIDR ────────────────────────────────────────────────
    cidr = raw.get("cidr_block", "")
    if cidr:
        try:
            network = ipaddress.IPv4Network(cidr, strict=False)
            if network.prefixlen <= 12:
                violations.append(_violation(
                    "VPC-005", "LOW",
                    f"VPC {resource['resource_id']} has an oversized CIDR block {cidr} "
                    f"({network.num_addresses:,} IPs). This wastes RFC-1918 space and complicates peering.",
                    "Use a /16 or smaller CIDR when creating new VPCs.",
                    resource,
                ))
        except ValueError:
            pass

    # ── VPC-006: No VPC Endpoints ─────────────────────────────────────────────
    if raw.get("endpoint_count", 0) == 0 and raw.get("has_internet_access", False):
        violations.append(_violation(
            "VPC-006", "MEDIUM",
            f"VPC {resource['resource_id']} has no VPC Endpoints. "
            "Traffic to AWS services (S3, DynamoDB, SSM…) routes via the internet gateway, "
            "incurring data-transfer costs and exposing traffic.",
            "Add Gateway Endpoints for S3 and DynamoDB (free). "
            "Add Interface Endpoints for SSM, ECR, and Secrets Manager.",
            resource,
            framework="FinOps",
        ))

    # ── VPC-007: Private subnets but no NAT Gateway ───────────────────────────
    if private_count > 0 and raw.get("nat_gateway_count", 0) == 0:
        violations.append(_violation(
            "VPC-007", "MEDIUM",
            f"VPC {resource['resource_id']} has {private_count} private subnet(s) but no NAT Gateway. "
            "Instances in private subnets cannot reach the internet for updates or API calls.",
            "Add a NAT Gateway in a public subnet, or use VPC Endpoints for AWS service traffic.",
            resource,
        ))

    # ── VPC-008: IGW with no public subnets ───────────────────────────────────
    if raw.get("igw_count", 0) > 0 and public_count == 0:
        violations.append(_violation(
            "VPC-008", "LOW",
            f"VPC {resource['resource_id']} has an Internet Gateway attached but no public subnets. "
            "The IGW is unused and represents unnecessary exposure.",
            "Detach and delete the unused Internet Gateway.",
            resource,
        ))

    # ── VPC-009: Missing required tags ────────────────────────────────────────
    required_tags = {"Environment", "Owner"}
    missing = required_tags - set(tags.keys())
    if missing:
        violations.append(_violation(
            "VPC-009", "LOW",
            f"VPC {resource['resource_id']} is missing tags: {', '.join(sorted(missing))}. "
            "Without tags you cannot allocate costs or identify ownership.",
            "Add Environment and Owner tags to all VPCs.",
            resource,
            framework="FinOps",
        ))

    return violations
