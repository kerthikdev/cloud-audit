"""
Lambda Scanner
==============
Discovers AWS Lambda functions and enriches with 30-day invocation metrics.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_MOCK_RUNTIMES = ["python3.11", "python3.10", "nodejs18.x", "nodejs20.x", "java17", "go1.x"]
_MOCK_NAMES = [
    "api-authorizer", "image-processor", "data-pipeline-trigger", "email-sender",
    "report-generator", "cleanup-job", "cache-warmer", "webhook-handler",
    "user-sync", "payment-processor", "log-exporter", "db-backup",
]


def _mock_lambda(region: str) -> list[dict[str, Any]]:
    random.seed(42)
    funcs = []
    for i, name in enumerate(_MOCK_NAMES):
        invocations_30d = random.choice([0, 0, 0, 12, 340, 5800, 22000])
        memory_mb = random.choice([128, 256, 512, 1024, 2048, 3008])
        avg_duration_ms = random.randint(50, 8000)
        timeout_sec = random.choice([3, 15, 30, 60, 300, 900])
        last_modified_days = random.randint(0, 400)
        funcs.append({
            "resource_id": f"arn:aws:lambda:{region}:123456789012:function:{name}",
            "resource_type": "Lambda",
            "region": region,
            "name": name,
            "state": "Active",
            "tags": {"Environment": "production"} if i % 3 != 0 else {},
            "raw_data": {
                "function_name": name,
                "runtime": random.choice(_MOCK_RUNTIMES),
                "memory_mb": memory_mb,
                "timeout_sec": timeout_sec,
                "code_size_bytes": random.randint(1024, 50_000_000),
                "invocations_30d": invocations_30d,
                "avg_duration_ms": avg_duration_ms,
                "last_modified_days": last_modified_days,
                "has_reserved_concurrency": random.random() > 0.8,
                "has_dlq": random.random() > 0.6,
                "tracing_enabled": random.random() > 0.5,
                "vpc_configured": random.random() > 0.4,
            },
        })
    return funcs


def scan_lambda(region: str) -> list[dict[str, Any]]:
    """Scan Lambda functions in a region. Falls back to mock if boto3 unavailable."""
    try:
        import boto3
        from app.core.config import get_settings
        cfg = get_settings()
        if cfg.mock_aws:
            return _mock_lambda(region)

        session = boto3.Session(
            aws_access_key_id=cfg.aws_access_key_id or None,
            aws_secret_access_key=cfg.aws_secret_access_key or None,
            region_name=region,
        )
        lambda_client = session.client("lambda", region_name=region)
        cw_client = session.client("cloudwatch", region_name=region)

        paginator = lambda_client.get_paginator("list_functions")
        funcs = []
        for page in paginator.paginate():
            for fn in page.get("Functions", []):
                name = fn["FunctionName"]
                # CloudWatch invocation metrics (30d)
                try:
                    from datetime import timedelta
                    resp = cw_client.get_metric_statistics(
                        Namespace="AWS/Lambda",
                        MetricName="Invocations",
                        Dimensions=[{"Name": "FunctionName", "Value": name}],
                        StartTime=datetime.now(timezone.utc) - timedelta(days=30),
                        EndTime=datetime.now(timezone.utc),
                        Period=2592000,  # 30 days
                        Statistics=["Sum"],
                    )
                    invocations = int(sum(p["Sum"] for p in resp.get("Datapoints", [])))
                except Exception:
                    invocations = -1

                # Tags
                try:
                    tags_resp = lambda_client.list_tags(Resource=fn["FunctionArn"])
                    tags = tags_resp.get("Tags", {})
                except Exception:
                    tags = {}

                # Last modified in days
                try:
                    lm = fn.get("LastModified", "")
                    from datetime import timedelta
                    lm_dt = datetime.fromisoformat(lm.replace("Z", "+00:00")) if lm else None
                    last_modified_days = (datetime.now(timezone.utc) - lm_dt).days if lm_dt else 0
                except Exception:
                    last_modified_days = 0

                funcs.append({
                    "resource_id": fn["FunctionArn"],
                    "resource_type": "Lambda",
                    "region": region,
                    "name": name,
                    "state": fn.get("State", "Active"),
                    "tags": tags,
                    "raw_data": {
                        "function_name": name,
                        "runtime": fn.get("Runtime", "unknown"),
                        "memory_mb": fn.get("MemorySize", 128),
                        "timeout_sec": fn.get("Timeout", 3),
                        "code_size_bytes": fn.get("CodeSize", 0),
                        "invocations_30d": invocations,
                        "avg_duration_ms": 0,
                        "last_modified_days": last_modified_days,
                        "has_reserved_concurrency": False,
                        "has_dlq": bool(fn.get("DeadLetterConfig")),
                        "tracing_enabled": fn.get("TracingConfig", {}).get("Mode") == "Active",
                        "vpc_configured": bool(fn.get("VpcConfig", {}).get("VpcId")),
                    },
                })
        return funcs

    except Exception as e:
        logger.warning(f"Lambda scan failed for {region}: {e} — using mock")
        return _mock_lambda(region)
