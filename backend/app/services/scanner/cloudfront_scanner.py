"""
CloudFront Scanner
==================
Discovers CloudFront distributions and checks security posture + traffic.
CloudFront is global; region param accepted but ignored.
"""
from __future__ import annotations

import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

_MOCK_DOMAINS = [
    "d1a2b3c4.cloudfront.net", "d5e6f7g8.cloudfront.net",
    "d9h0i1j2.cloudfront.net", "dk3l4m5n.cloudfront.net",
]


def _mock_cloudfront(region: str) -> list[dict[str, Any]]:
    random.seed(13)
    items = []
    for i, domain in enumerate(_MOCK_DOMAINS):
        dist_id = f"E{''.join(random.choices('ABCDEFGHIJKLMNOP', k=14))}"
        requests_30d = random.choice([0, 0, 120, 45000, 2_000_000])
        has_waf = random.random() > 0.5
        https_only = random.random() > 0.4
        has_geo_restriction = random.random() > 0.6
        price_class = random.choice(["PriceClass_All", "PriceClass_200", "PriceClass_100"])
        items.append({
            "resource_id": dist_id,
            "resource_type": "CloudFront",
            "region": "global",
            "name": domain,
            "state": "Deployed",
            "tags": {},
            "raw_data": {
                "distribution_id": dist_id,
                "domain_name": domain,
                "status": "Deployed",
                "price_class": price_class,
                "has_waf": has_waf,
                "https_only": https_only,
                "has_geo_restriction": has_geo_restriction,
                "http_version": "http2",
                "requests_30d": requests_30d,
                "logging_enabled": random.random() > 0.5,
                "origins_count": random.randint(1, 4),
            },
        })
    return items


def scan_cloudfront(region: str) -> list[dict[str, Any]]:
    """Scan CloudFront distributions. Falls back to mock if AWS unavailable."""
    try:
        import boto3
        from app.core.config import get_settings
        cfg = get_settings()
        if cfg.mock_aws:
            return _mock_cloudfront(region)

        session = boto3.Session(
            aws_access_key_id=cfg.aws_access_key_id or None,
            aws_secret_access_key=cfg.aws_secret_access_key or None,
            region_name="us-east-1",
        )
        cf_client = session.client("cloudfront")
        cw_client = session.client("cloudwatch", region_name="us-east-1")

        from datetime import datetime, timezone, timedelta
        items = []
        paginator = cf_client.get_paginator("list_distributions")
        for page in paginator.paginate():
            dist_list = page.get("DistributionList", {}).get("Items", [])
            for dist in dist_list:
                dist_id = dist["Id"]
                origins = dist.get("Origins", {}).get("Items", [])

                # 30d request count from CloudWatch
                try:
                    resp = cw_client.get_metric_statistics(
                        Namespace="AWS/CloudFront",
                        MetricName="Requests",
                        Dimensions=[{"Name": "DistributionId", "Value": dist_id},
                                    {"Name": "Region", "Value": "Global"}],
                        StartTime=datetime.now(timezone.utc) - timedelta(days=30),
                        EndTime=datetime.now(timezone.utc),
                        Period=2592000,
                        Statistics=["Sum"],
                    )
                    requests_30d = int(sum(p["Sum"] for p in resp.get("Datapoints", [])))
                except Exception:
                    requests_30d = -1

                gc = dist.get("Restrictions", {}).get("GeoRestriction", {})
                items.append({
                    "resource_id": dist_id,
                    "resource_type": "CloudFront",
                    "region": "global",
                    "name": dist.get("DomainName", dist_id),
                    "state": dist.get("Status", "Unknown"),
                    "tags": {},
                    "raw_data": {
                        "distribution_id": dist_id,
                        "domain_name": dist.get("DomainName", ""),
                        "status": dist.get("Status", ""),
                        "price_class": dist.get("PriceClass", ""),
                        "has_waf": bool(dist.get("WebACLId")),
                        "https_only": dist.get("DefaultCacheBehavior", {}).get("ViewerProtocolPolicy") == "https-only",
                        "has_geo_restriction": gc.get("RestrictionType", "none") != "none",
                        "http_version": dist.get("HttpVersion", "http1.1"),
                        "requests_30d": requests_30d,
                        "logging_enabled": bool(dist.get("Logging", {}).get("Enabled")),
                        "origins_count": len(origins),
                    },
                })
        return items

    except Exception as e:
        logger.warning(f"CloudFront scan failed: {e} — using mock")
        return _mock_cloudfront(region)
