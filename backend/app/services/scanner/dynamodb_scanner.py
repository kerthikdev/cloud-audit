"""
DynamoDB Scanner — discovers tables across all regions.

Collects per table:
 - Table name, status, item count, size bytes
 - Billing mode (PAY_PER_REQUEST vs PROVISIONED)
 - Point-in-time recovery (PITR) status
 - Encryption at rest (SSE)
 - Stream enabled
 - Global tables / replicas
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


def scan_dynamodb(region: str) -> list[dict[str, Any]]:
    """Scan all DynamoDB tables in the given region."""
    cfg = get_settings()
    if cfg.mock_aws:
        return _mock_dynamodb(region)

    try:
        client = get_client("dynamodb", region)
        resources: list[dict[str, Any]] = []

        # Paginate all table names
        table_names: list[str] = []
        paginator = client.get_paginator("list_tables")
        for page in paginator.paginate():
            table_names.extend(page.get("TableNames", []))

        if not table_names:
            return []

        for name in table_names:
            try:
                desc = client.describe_table(TableName=name)["Table"]
            except Exception:
                continue

            table_arn = desc.get("TableArn", "")
            status = desc.get("TableStatus", "ACTIVE")
            item_count = desc.get("ItemCount", 0)
            size_bytes = desc.get("TableSizeBytes", 0)
            billing = desc.get("BillingModeSummary", {}).get("BillingMode", "PROVISIONED")
            read_capacity = desc.get("ProvisionedThroughput", {}).get("ReadCapacityUnits", 0)
            write_capacity = desc.get("ProvisionedThroughput", {}).get("WriteCapacityUnits", 0)
            stream_enabled = bool(desc.get("StreamSpecification", {}).get("StreamEnabled"))
            sse_enabled = desc.get("SSEDescription", {}).get("Status") in ("ENABLED", "UPDATING")
            replica_count = len(desc.get("Replicas", []))

            # PITR status
            pitr_enabled = False
            try:
                pitr = client.describe_continuous_backups(TableName=name)
                pitr_resp = pitr.get("ContinuousBackupsDescription", {})
                pitr_enabled = pitr_resp.get("PointInTimeRecoveryDescription", {}).get("PointInTimeRecoveryStatus") == "ENABLED"
            except Exception:
                pass

            # Tags
            tags: dict[str, str] = {}
            try:
                tag_resp = client.list_tags_of_resource(ResourceArn=table_arn)
                tags = _tag_map(tag_resp.get("Tags", []))
            except Exception:
                pass

            resource: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "resource_id": name,
                "resource_type": "DynamoDB",
                "region": region,
                "name": name,
                "state": status.lower(),
                "tags": tags,
                "raw_data": {
                    "table_arn":      table_arn,
                    "status":         status,
                    "item_count":     item_count,
                    "size_bytes":     size_bytes,
                    "size_mb":        round(size_bytes / (1024 * 1024), 2),
                    "billing_mode":   billing,
                    "read_capacity":  read_capacity,
                    "write_capacity": write_capacity,
                    "pitr_enabled":   pitr_enabled,
                    "sse_enabled":    sse_enabled,
                    "stream_enabled": stream_enabled,
                    "replica_count":  replica_count,
                },
                "risk_score": 0,
                "violation_count": 0,
            }
            resources.append(resource)

        logger.info(f"DynamoDB scan {region}: {len(resources)} tables found")
        return resources

    except Exception as exc:
        logger.error(f"DynamoDB scan failed in {region}: {exc}")
        return []


def _mock_dynamodb(region: str) -> list[dict[str, Any]]:
    mocks = [
        {"name": "users-table", "status": "ACTIVE", "items": 42000, "size": 52428800,
         "billing": "PAY_PER_REQUEST", "pitr": True, "sse": True, "stream": False, "replicas": 0},
        {"name": "sessions-table", "status": "ACTIVE", "items": 8000, "size": 8388608,
         "billing": "PROVISIONED", "pitr": False, "sse": False, "stream": True, "replicas": 0},
        {"name": "audit-events", "status": "ACTIVE", "items": 210000, "size": 209715200,
         "billing": "PAY_PER_REQUEST", "pitr": False, "sse": True, "stream": False, "replicas": 2},
    ]
    resources = []
    for m in mocks:
        resources.append({
            "id": str(uuid.uuid4()),
            "resource_id": m["name"],
            "resource_type": "DynamoDB",
            "region": region,
            "name": m["name"],
            "state": "active",
            "tags": {},
            "raw_data": {
                "table_arn":      f"arn:aws:dynamodb:{region}:123456789012:table/{m['name']}",
                "status":         m["status"],
                "item_count":     m["items"],
                "size_bytes":     m["size"],
                "size_mb":        round(m["size"] / (1024 * 1024), 2),
                "billing_mode":   m["billing"],
                "read_capacity":  0 if m["billing"] == "PAY_PER_REQUEST" else 5,
                "write_capacity": 0 if m["billing"] == "PAY_PER_REQUEST" else 5,
                "pitr_enabled":   m["pitr"],
                "sse_enabled":    m["sse"],
                "stream_enabled": m["stream"],
                "replica_count":  m["replicas"],
            },
            "risk_score": 0,
            "violation_count": 0,
        })
    return resources
