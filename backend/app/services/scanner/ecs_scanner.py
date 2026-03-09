"""
ECS Scanner — discovers ECS clusters and their services.

Collects per cluster:
 - Cluster name, status, capacity providers
 - Running / pending task counts
 - Service count
 - Container Insights enabled
 - Services (name, task def, desired/running counts, launch type)
 - Tags
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.config import get_settings
from app.utils.aws_client_factory import get_client

logger = logging.getLogger(__name__)

_CHUNK = 100  # max ARNs per describe call


def _chunks(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def scan_ecs(region: str) -> list[dict[str, Any]]:
    """Scan ECS clusters and their services in the given region."""
    cfg = get_settings()
    if cfg.mock_aws:
        return _mock_ecs(region)

    try:
        client = get_client("ecs", region)
        resources: list[dict[str, Any]] = []

        # List all cluster ARNs
        cluster_arns: list[str] = []
        paginator = client.get_paginator("list_clusters")
        for page in paginator.paginate():
            cluster_arns.extend(page.get("clusterArns", []))

        if not cluster_arns:
            return []

        # Describe clusters in chunks
        clusters: list[dict] = []
        for chunk in _chunks(cluster_arns, _CHUNK):
            resp = client.describe_clusters(clusters=chunk, include=["TAGS", "SETTINGS"])
            clusters.extend(resp.get("clusters", []))

        for cluster in clusters:
            cluster_name = cluster.get("clusterName", "")
            cluster_arn  = cluster.get("clusterArn", "")
            status = cluster.get("status", "ACTIVE")

            # Container Insights setting
            insights_enabled = any(
                s.get("name") == "containerInsights" and s.get("value") == "enabled"
                for s in cluster.get("settings", [])
            )

            # Capacity providers
            capacity_providers = cluster.get("capacityProviders", [])
            has_fargate = any("FARGATE" in cp for cp in capacity_providers)

            # Services in this cluster
            svc_arns: list[str] = []
            try:
                svc_paginator = client.get_paginator("list_services")
                for page in svc_paginator.paginate(cluster=cluster_arn):
                    svc_arns.extend(page.get("serviceArns", []))
            except Exception:
                pass

            services: list[dict] = []
            unhealthy_services = 0
            for chunk in _chunks(svc_arns, 10):  # describe_services max 10
                try:
                    resp = client.describe_services(cluster=cluster_arn, services=chunk)
                    for svc in resp.get("services", []):
                        desired = svc.get("desiredCount", 0)
                        running = svc.get("runningCount", 0)
                        if desired > 0 and running < desired:
                            unhealthy_services += 1
                        services.append({
                            "name":        svc.get("serviceName", ""),
                            "launch_type": svc.get("launchType", "EC2"),
                            "desired":     desired,
                            "running":     running,
                            "pending":     svc.get("pendingCount", 0),
                        })
                except Exception:
                    pass

            # Tags
            tags: dict[str, str] = {}
            try:
                tag_resp = client.list_tags_for_resource(resourceArn=cluster_arn)
                tags = {t["key"]: t["value"] for t in tag_resp.get("tags", [])}
            except Exception:
                pass

            resource: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "resource_id": cluster_name,
                "resource_type": "ECS",
                "region": region,
                "name": cluster_name,
                "state": status.lower(),
                "tags": tags,
                "raw_data": {
                    "cluster_arn":         cluster_arn,
                    "status":              status,
                    "running_tasks":       cluster.get("runningTasksCount", 0),
                    "pending_tasks":       cluster.get("pendingTasksCount", 0),
                    "active_services":     cluster.get("activeServicesCount", 0),
                    "container_insights":  insights_enabled,
                    "has_fargate":         has_fargate,
                    "capacity_providers":  capacity_providers,
                    "service_count":       len(svc_arns),
                    "unhealthy_services":  unhealthy_services,
                    "services":            services[:20],  # show top 20
                },
                "risk_score": 0,
                "violation_count": 0,
            }
            resources.append(resource)

        logger.info(f"ECS scan {region}: {len(resources)} clusters found")
        return resources

    except Exception as exc:
        logger.error(f"ECS scan failed in {region}: {exc}")
        return []


def _mock_ecs(region: str) -> list[dict[str, Any]]:
    mocks = [
        {
            "name": "production-cluster",
            "status": "ACTIVE",
            "running": 8,
            "pending": 0,
            "services": 3,
            "insights": True,
            "fargate": True,
            "unhealthy": 0,
            "svcs": [
                {"name": "api-service", "launch_type": "FARGATE", "desired": 3, "running": 3, "pending": 0},
                {"name": "worker-service", "launch_type": "FARGATE", "desired": 2, "running": 2, "pending": 0},
                {"name": "scheduler", "launch_type": "EC2", "desired": 1, "running": 1, "pending": 0},
            ],
        },
        {
            "name": "dev-cluster",
            "status": "ACTIVE",
            "running": 2,
            "pending": 1,
            "services": 2,
            "insights": False,
            "fargate": False,
            "unhealthy": 1,
            "svcs": [
                {"name": "dev-api", "launch_type": "EC2", "desired": 2, "running": 1, "pending": 1},
                {"name": "dev-worker", "launch_type": "EC2", "desired": 1, "running": 1, "pending": 0},
            ],
        },
    ]
    resources = []
    for m in mocks:
        resources.append({
            "id": str(uuid.uuid4()),
            "resource_id": m["name"],
            "resource_type": "ECS",
            "region": region,
            "name": m["name"],
            "state": "active",
            "tags": {},
            "raw_data": {
                "cluster_arn":         f"arn:aws:ecs:{region}:123456789012:cluster/{m['name']}",
                "status":              m["status"],
                "running_tasks":       m["running"],
                "pending_tasks":       m["pending"],
                "active_services":     m["services"],
                "container_insights":  m["insights"],
                "has_fargate":         m["fargate"],
                "capacity_providers":  ["FARGATE"] if m["fargate"] else ["EC2"],
                "service_count":       m["services"],
                "unhealthy_services":  m["unhealthy"],
                "services":            m["svcs"],
            },
            "risk_score": 0,
            "violation_count": 0,
        })
    return resources
