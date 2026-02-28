"""
CloudWatch Scanner
==================
Discovers CloudWatch alarms and log groups, flagging:
- Alarms stuck in INSUFFICIENT_DATA (misconfigured metrics)
- Log groups with no retention policy (unbounded cost)
"""
from __future__ import annotations

import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

_MOCK_LOG_GROUPS = [
    "/aws/lambda/api-authorizer", "/aws/lambda/image-processor",
    "/aws/ecs/prod-cluster", "/aws/rds/instance/prod-db/postgresql",
    "/application/backend/access", "/application/backend/error",
    "/aws/cloudtrail/logs", "/aws/apigateway/prod",
]

_MOCK_ALARM_NAMES = [
    "cpu-high-alarm", "memory-usage-alarm", "disk-io-alarm",
    "error-rate-alarm", "latency-p99-alarm", "health-check-alarm",
]


def _mock_cloudwatch(region: str) -> list[dict[str, Any]]:
    random.seed(99)
    items = []
    # Log groups
    for lg in _MOCK_LOG_GROUPS:
        has_retention = random.random() > 0.45
        size_mb = random.randint(10, 50_000)
        items.append({
            "resource_id": f"log-group:{region}:{lg}",
            "resource_type": "CloudWatch",
            "region": region,
            "name": lg,
            "state": "active",
            "tags": {},
            "raw_data": {
                "resource_subtype": "log_group",
                "log_group_name": lg,
                "retention_days": random.choice([7, 14, 30, 60, 90, 180]) if has_retention else None,
                "has_retention": has_retention,
                "stored_bytes": size_mb * 1024 * 1024,
                "size_mb": size_mb,
            },
        })
    # Alarms
    for aname in _MOCK_ALARM_NAMES:
        state = random.choice(["OK", "ALARM", "INSUFFICIENT_DATA", "INSUFFICIENT_DATA", "OK"])
        items.append({
            "resource_id": f"alarm:{region}:{aname}",
            "resource_type": "CloudWatch",
            "region": region,
            "name": aname,
            "state": state,
            "tags": {},
            "raw_data": {
                "resource_subtype": "alarm",
                "alarm_name": aname,
                "state": state,
                "metric_name": aname.replace("-alarm", "").replace("-", "_"),
                "namespace": "AWS/EC2",
                "has_actions": random.random() > 0.4,
                "last_state_change_days": random.randint(0, 120),
            },
        })
    return items


def scan_cloudwatch(region: str) -> list[dict[str, Any]]:
    """Scan CloudWatch alarms and log groups. Falls back to mock if AWS unavailable."""
    try:
        import boto3
        from app.core.config import get_settings
        cfg = get_settings()
        if cfg.mock_aws:
            return _mock_cloudwatch(region)

        session = boto3.Session(
            aws_access_key_id=cfg.aws_access_key_id or None,
            aws_secret_access_key=cfg.aws_secret_access_key or None,
            region_name=region,
        )
        cw = session.client("cloudwatch", region_name=region)
        logs = session.client("logs", region_name=region)
        items = []

        # Log groups
        lg_paginator = logs.get_paginator("describe_log_groups")
        for page in lg_paginator.paginate():
            for lg in page.get("logGroups", []):
                name = lg.get("logGroupName", "")
                ret = lg.get("retentionInDays")
                size_bytes = lg.get("storedBytes", 0)
                items.append({
                    "resource_id": f"log-group:{region}:{name}",
                    "resource_type": "CloudWatch",
                    "region": region,
                    "name": name,
                    "state": "active",
                    "tags": {},
                    "raw_data": {
                        "resource_subtype": "log_group",
                        "log_group_name": name,
                        "retention_days": ret,
                        "has_retention": ret is not None,
                        "stored_bytes": size_bytes,
                        "size_mb": round(size_bytes / 1024 / 1024, 1),
                    },
                })

        # Alarms
        alarm_paginator = cw.get_paginator("describe_alarms")
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        for page in alarm_paginator.paginate():
            for alarm in page.get("MetricAlarms", []):
                state = alarm.get("StateValue", "OK")
                lsc = alarm.get("StateUpdatedTimestamp")
                last_change_days = (now - lsc.replace(tzinfo=timezone.utc)).days if lsc else 0
                items.append({
                    "resource_id": f"alarm:{region}:{alarm['AlarmName']}",
                    "resource_type": "CloudWatch",
                    "region": region,
                    "name": alarm["AlarmName"],
                    "state": state,
                    "tags": {},
                    "raw_data": {
                        "resource_subtype": "alarm",
                        "alarm_name": alarm["AlarmName"],
                        "state": state,
                        "metric_name": alarm.get("MetricName", ""),
                        "namespace": alarm.get("Namespace", ""),
                        "has_actions": bool(alarm.get("AlarmActions")),
                        "last_state_change_days": last_change_days,
                    },
                })
        return items

    except Exception as e:
        logger.warning(f"CloudWatch scan failed for {region}: {e} — using mock")
        return _mock_cloudwatch(region)
