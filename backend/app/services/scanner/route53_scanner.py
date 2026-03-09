"""
Route 53 Scanner — discovers hosted zones (global service, runs once).

Collects per hosted zone:
 - Name, type (public / private)
 - Record count
 - Query logging enabled
 - DNSSEC signing status
 - Associated VPCs (for private zones)
 - Tags
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.config import get_settings
from app.utils.aws_client_factory import get_client

logger = logging.getLogger(__name__)


def _tag_map(raw_tags: list[dict]) -> dict[str, str]:
    return {t["Key"]: t["Value"] for t in (raw_tags or [])}


def scan_route53(region: str) -> list[dict[str, Any]]:
    """
    Scan Route 53 hosted zones.
    Route 53 is a global service — region arg is ignored, always uses us-east-1 endpoint.
    """
    cfg = get_settings()
    if cfg.mock_aws:
        return _mock_route53(region)

    try:
        client = get_client("route53", "us-east-1")  # Route53 is global
        resources: list[dict[str, Any]] = []

        paginator = client.get_paginator("list_hosted_zones")
        zones: list[dict] = []
        for page in paginator.paginate():
            zones.extend(page.get("HostedZones", []))

        # Pre-fetch query logging configs in bulk (one call)
        qlc_map: dict[str, bool] = {}
        try:
            qlc_resp = client.list_query_logging_configs()
            for qlc in qlc_resp.get("QueryLoggingConfigs", []):
                zone_id = qlc.get("HostedZoneId", "").split("/")[-1]
                qlc_map[zone_id] = True
        except Exception:
            pass

        for zone in zones:
            raw_id = zone.get("Id", "")
            zone_id = raw_id.split("/")[-1]  # strip /hostedzone/ prefix
            name = zone.get("Name", "").rstrip(".")
            is_private = zone.get("Config", {}).get("PrivateZone", False)
            record_count = zone.get("ResourceRecordSetCount", 0)

            # Tags
            tags: dict[str, str] = {}
            try:
                tag_resp = client.list_tags_for_resource(
                    ResourceType="hostedzone", ResourceId=zone_id
                )
                tags = _tag_map(tag_resp.get("ResourceTagSet", {}).get("Tags", []))
            except Exception:
                pass

            # DNSSEC signing (public zones only)
            dnssec_enabled = False
            if not is_private:
                try:
                    dnssec = client.get_dnssec(HostedZoneId=zone_id)
                    dnssec_enabled = dnssec.get("KeySigningKeys", []) != []
                except Exception:
                    pass

            # VPCs (private zones only)
            vpc_count = len(zone.get("VPCs", []))

            resource: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "resource_id": zone_id,
                "resource_type": "Route53",
                "region": "global",
                "name": name,
                "state": "active",
                "tags": tags,
                "raw_data": {
                    "zone_id":        zone_id,
                    "fqdn":           name,
                    "is_private":     is_private,
                    "record_count":   record_count,
                    "query_logging":  qlc_map.get(zone_id, False),
                    "dnssec_enabled": dnssec_enabled,
                    "vpc_count":      vpc_count,
                    "comment":        zone.get("Config", {}).get("Comment", ""),
                },
                "risk_score": 0,
                "violation_count": 0,
            }
            resources.append(resource)

        logger.info(f"Route53 scan: {len(resources)} hosted zones found")
        return resources

    except Exception as exc:
        logger.error(f"Route53 scan failed: {exc}")
        return []


def _mock_route53(region: str) -> list[dict[str, Any]]:
    mocks = [
        {"id": "Z1ABC123DEF456", "name": "example.com", "private": False,
         "records": 24, "logging": True, "dnssec": False, "vpcs": 0},
        {"id": "Z2XYZ789GHI012", "name": "internal.example.com", "private": True,
         "records": 8, "logging": False, "dnssec": False, "vpcs": 2},
    ]
    resources = []
    for m in mocks:
        resources.append({
            "id": str(uuid.uuid4()),
            "resource_id": m["id"],
            "resource_type": "Route53",
            "region": "global",
            "name": m["name"],
            "state": "active",
            "tags": {},
            "raw_data": {
                "zone_id":        m["id"],
                "fqdn":           m["name"],
                "is_private":     m["private"],
                "record_count":   m["records"],
                "query_logging":  m["logging"],
                "dnssec_enabled": m["dnssec"],
                "vpc_count":      m["vpcs"],
                "comment":        "",
            },
            "risk_score": 0,
            "violation_count": 0,
        })
    return resources
