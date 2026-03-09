"""
ElastiCache Scanner — discovers cache clusters and replication groups.

Collects per cluster:
 - Engine (redis / memcached), version
 - Node type and count
 - Status, encryption at rest/transit
 - Multi-AZ, automatic failover
 - Auth token / password enabled (Redis)
 - Tags
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.config import get_settings
from app.utils.aws_client_factory import get_client

logger = logging.getLogger(__name__)


def scan_elasticache(region: str) -> list[dict[str, Any]]:
    """Scan ElastiCache clusters and replication groups in the given region."""
    cfg = get_settings()
    if cfg.mock_aws:
        return _mock_elasticache(region)

    try:
        client = get_client("elasticache", region)
        resources: list[dict[str, Any]] = []

        # ── Replication Groups (Redis) ─────────────────────────────────────────
        try:
            rg_resp = client.describe_replication_groups()
            for rg in rg_resp.get("ReplicationGroups", []):
                rg_id = rg.get("ReplicationGroupId", "")
                member_ids = rg.get("MemberClusters", [])

                # Fetch one member cluster for node type
                node_type = "unknown"
                engine_version = "unknown"
                if member_ids:
                    try:
                        c = client.describe_cache_clusters(
                            CacheClusterId=member_ids[0], ShowCacheNodeInfo=False
                        )["CacheClusters"][0]
                        node_type    = c.get("CacheNodeType", "unknown")
                        engine_version = c.get("EngineVersion", "unknown")
                    except Exception:
                        pass

                resource: dict[str, Any] = {
                    "id": str(uuid.uuid4()),
                    "resource_id": rg_id,
                    "resource_type": "ElastiCache",
                    "region": region,
                    "name": rg.get("Description") or rg_id,
                    "state": rg.get("Status", "available").lower(),
                    "tags": {},
                    "raw_data": {
                        "engine":              "redis",
                        "engine_version":      engine_version,
                        "node_type":           node_type,
                        "node_count":          len(member_ids),
                        "status":              rg.get("Status", ""),
                        "multi_az":            rg.get("MultiAZ", "disabled") != "disabled",
                        "auto_failover":       rg.get("AutomaticFailover", "disabled") != "disabled",
                        "at_rest_encryption":  rg.get("AtRestEncryptionEnabled", False),
                        "in_transit_encryption": rg.get("TransitEncryptionEnabled", False),
                        "auth_enabled":        rg.get("AuthTokenEnabled", False),
                        "is_replication_group": True,
                    },
                    "risk_score": 0,
                    "violation_count": 0,
                }
                resources.append(resource)
        except Exception as e:
            logger.debug(f"ElastiCache replication groups error in {region}: {e}")

        # ── Standalone Clusters (Memcached) ──────────────────────────────────
        try:
            cluster_resp = client.describe_cache_clusters()
            for cluster in cluster_resp.get("CacheClusters", []):
                engine = cluster.get("Engine", "")
                if engine == "redis" and cluster.get("ReplicationGroupId"):
                    continue  # Already captured via replication group

                cid = cluster.get("CacheClusterId", "")
                resource = {
                    "id": str(uuid.uuid4()),
                    "resource_id": cid,
                    "resource_type": "ElastiCache",
                    "region": region,
                    "name": cid,
                    "state": cluster.get("CacheClusterStatus", "available").lower(),
                    "tags": {},
                    "raw_data": {
                        "engine":              engine,
                        "engine_version":      cluster.get("EngineVersion", ""),
                        "node_type":           cluster.get("CacheNodeType", ""),
                        "node_count":          cluster.get("NumCacheNodes", 1),
                        "status":              cluster.get("CacheClusterStatus", ""),
                        "multi_az":            False,
                        "auto_failover":       False,
                        "at_rest_encryption":  cluster.get("AtRestEncryptionEnabled", False),
                        "in_transit_encryption": cluster.get("TransitEncryptionEnabled", False),
                        "auth_enabled":        cluster.get("AuthTokenEnabled", False),
                        "is_replication_group": False,
                    },
                    "risk_score": 0,
                    "violation_count": 0,
                }
                resources.append(resource)
        except Exception as e:
            logger.debug(f"ElastiCache clusters error in {region}: {e}")

        logger.info(f"ElastiCache scan {region}: {len(resources)} clusters found")
        return resources

    except Exception as exc:
        logger.error(f"ElastiCache scan failed in {region}: {exc}")
        return []


def _mock_elasticache(region: str) -> list[dict[str, Any]]:
    mocks = [
        {"id": "prod-redis", "engine": "redis", "version": "7.0.7", "node": "cache.r6g.large",
         "nodes": 2, "multi_az": True, "failover": True, "sse": True, "tls": True, "auth": True},
        {"id": "dev-memcached", "engine": "memcached", "version": "1.6.17", "node": "cache.t3.micro",
         "nodes": 1, "multi_az": False, "failover": False, "sse": False, "tls": False, "auth": False},
    ]
    resources = []
    for m in mocks:
        resources.append({
            "id": str(uuid.uuid4()),
            "resource_id": m["id"],
            "resource_type": "ElastiCache",
            "region": region,
            "name": m["id"],
            "state": "available",
            "tags": {},
            "raw_data": {
                "engine":              m["engine"],
                "engine_version":      m["version"],
                "node_type":           m["node"],
                "node_count":          m["nodes"],
                "status":              "available",
                "multi_az":            m["multi_az"],
                "auto_failover":       m["failover"],
                "at_rest_encryption":  m["sse"],
                "in_transit_encryption": m["tls"],
                "auth_enabled":        m["auth"],
                "is_replication_group": m["engine"] == "redis",
            },
            "risk_score": 0,
            "violation_count": 0,
        })
    return resources
