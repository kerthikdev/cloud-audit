"""
VPC Scanner — discovers VPCs and their networking components across all regions.

Collects per VPC:
 - Basic info (CIDR, state, default/custom)
 - Subnets (count, public vs private, available IPs)
 - Internet Gateways (attached / detached)
 - Route Tables
 - Flow Logs (enabled / disabled — security signal)
 - NAT Gateways & VPC Endpoints count
 - Tags
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.config import get_settings
from app.utils.aws_client_factory import get_client

logger = logging.getLogger(__name__)


def _tag_map(tags: list[dict]) -> dict[str, str]:
    return {t["Key"]: t["Value"] for t in (tags or [])}


def scan_vpc(region: str) -> list[dict[str, Any]]:
    """Scan all VPCs in the given region and return normalised resource dicts."""
    cfg = get_settings()

    # ── Mock mode ──────────────────────────────────────────────────────────────
    if cfg.mock_aws:
        return _mock_vpcs(region)

    try:
        ec2 = get_client("ec2", region)
        resources: list[dict[str, Any]] = []

        # ── Fetch all VPCs ─────────────────────────────────────────────────────
        vpcs = ec2.describe_vpcs().get("Vpcs", [])
        if not vpcs:
            return []

        # ── Pre-fetch supporting data (one API call each, faster than per-VPC) ─
        all_subnets     = ec2.describe_subnets().get("Subnets", [])
        all_igws        = ec2.describe_internet_gateways().get("InternetGateways", [])
        all_route_tables = ec2.describe_route_tables().get("RouteTables", [])
        all_endpoints   = ec2.describe_vpc_endpoints().get("VpcEndpoints", [])
        all_nat_gws     = ec2.describe_nat_gateways().get("NatGateways", [])

        # ── Flow logs — one call, filter by resource type ─────────────────────
        fl_resp = ec2.describe_flow_logs(
            Filters=[{"Name": "resource-type", "Values": ["VPC"]}]
        )
        flow_log_vpc_ids = {
            fl["ResourceId"]
            for fl in fl_resp.get("FlowLogs", [])
            if fl.get("FlowLogStatus") == "ACTIVE"
        }

        for vpc in vpcs:
            vpc_id = vpc["VpcId"]
            tags   = _tag_map(vpc.get("Tags", []))
            name   = tags.get("Name", "")

            # Subnets for this VPC
            subnets = [s for s in all_subnets if s.get("VpcId") == vpc_id]
            public_subnets  = [s for s in subnets if s.get("MapPublicIpOnLaunch")]
            private_subnets = [s for s in subnets if not s.get("MapPublicIpOnLaunch")]
            total_available_ips = sum(
                s.get("AvailableIpAddressCount", 0) for s in subnets
            )

            # Internet Gateways attached to this VPC
            igws_attached = [
                igw for igw in all_igws
                if any(att.get("VpcId") == vpc_id for att in igw.get("Attachments", []))
            ]

            # Route tables
            rt_count = sum(1 for rt in all_route_tables if rt.get("VpcId") == vpc_id)

            # NAT Gateways (active only)
            nat_count = sum(
                1 for n in all_nat_gws
                if n.get("VpcId") == vpc_id and n.get("State") not in ("deleted", "failed")
            )

            # VPC Endpoints
            endpoint_count = sum(
                1 for ep in all_endpoints
                if ep.get("VpcId") == vpc_id and ep.get("State") == "available"
            )

            flow_logs_enabled = vpc_id in flow_log_vpc_ids

            resource: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "resource_id": vpc_id,
                "resource_type": "VPC",
                "region": region,
                "name": name or vpc_id,
                "state": vpc.get("State", "available"),
                "tags": tags,
                "raw_data": {
                    "cidr_block":          vpc.get("CidrBlock"),
                    "is_default":          vpc.get("IsDefault", False),
                    "dhcp_options_id":     vpc.get("DhcpOptionsId"),
                    "instance_tenancy":    vpc.get("InstanceTenancy", "default"),
                    "flow_logs_enabled":   flow_logs_enabled,
                    "subnet_count":        len(subnets),
                    "public_subnet_count": len(public_subnets),
                    "private_subnet_count": len(private_subnets),
                    "available_ips":       total_available_ips,
                    "igw_count":           len(igws_attached),
                    "route_table_count":   rt_count,
                    "nat_gateway_count":   nat_count,
                    "endpoint_count":      endpoint_count,
                    "has_internet_access": len(igws_attached) > 0,
                },
                "risk_score":      0,
                "violation_count": 0,
            }
            resources.append(resource)

        logger.info(f"VPC scan {region}: {len(resources)} VPCs found")
        return resources

    except Exception as exc:
        logger.error(f"VPC scan failed in {region}: {exc}")
        return []


# ── Mock data ─────────────────────────────────────────────────────────────────

def _mock_vpcs(region: str) -> list[dict[str, Any]]:
    """Return realistic mock VPC data for demo/development."""
    import random
    mocks = [
        {
            "vpc_id":          "vpc-0a1b2c3d4e5f60001",
            "name":            "prod-vpc",
            "cidr":            "10.0.0.0/16",
            "is_default":      False,
            "flow_logs":       True,
            "subnets":         6,
            "public_subnets":  2,
            "private_subnets": 4,
            "igw":             1,
            "nat":             2,
            "endpoints":       3,
            "available_ips":   1020,
        },
        {
            "vpc_id":          "vpc-0a1b2c3d4e5f60002",
            "name":            "dev-vpc",
            "cidr":            "172.31.0.0/16",
            "is_default":      True,
            "flow_logs":       False,
            "subnets":         3,
            "public_subnets":  3,
            "private_subnets": 0,
            "igw":             1,
            "nat":             0,
            "endpoints":       0,
            "available_ips":   2048,
        },
        {
            "vpc_id":          "vpc-0a1b2c3d4e5f60003",
            "name":            "",
            "cidr":            "192.168.0.0/24",
            "is_default":      False,
            "flow_logs":       False,
            "subnets":         1,
            "public_subnets":  0,
            "private_subnets": 1,
            "igw":             0,
            "nat":             0,
            "endpoints":       0,
            "available_ips":   250,
        },
    ]
    resources = []
    for m in mocks:
        resources.append({
            "id": str(uuid.uuid4()),
            "resource_id": m["vpc_id"],
            "resource_type": "VPC",
            "region": region,
            "name": m["name"] or m["vpc_id"],
            "state": "available",
            "tags": {"Name": m["name"]} if m["name"] else {},
            "raw_data": {
                "cidr_block":           m["cidr"],
                "is_default":           m["is_default"],
                "dhcp_options_id":      "dopt-default",
                "instance_tenancy":     "default",
                "flow_logs_enabled":    m["flow_logs"],
                "subnet_count":         m["subnets"],
                "public_subnet_count":  m["public_subnets"],
                "private_subnet_count": m["private_subnets"],
                "available_ips":        m["available_ips"],
                "igw_count":            m["igw"],
                "route_table_count":    m["subnets"] + 1,
                "nat_gateway_count":    m["nat"],
                "endpoint_count":       m["endpoints"],
                "has_internet_access":  m["igw"] > 0,
            },
            "risk_score": 0,
            "violation_count": 0,
        })
    return resources
