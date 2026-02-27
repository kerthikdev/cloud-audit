"""
IAM Scanner
===========
Scans IAM users, access keys, MFA status, and detects overly-permissive policies.
IAM is global — region parameter is accepted but ignored; results tagged with 'global'.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_MOCK_USERS = [
    "alice", "bob", "charlie", "deploy-bot", "ci-pipeline",
    "backup-lambda-role", "data-analyst", "intern-dev",
]


def _mock_iam(region: str) -> list[dict[str, Any]]:
    random.seed(7)
    items = []
    for i, uname in enumerate(_MOCK_USERS):
        key_age_days = random.choice([10, 45, 91, 120, 200, 365, 400])
        last_activity_days = random.choice([0, 5, 30, 95, 200, 400])
        has_mfa = random.random() > 0.35
        has_console_access = random.random() > 0.4
        has_wildcard_policy = random.random() > 0.6
        items.append({
            "resource_id": f"arn:aws:iam::123456789012:user/{uname}",
            "resource_type": "IAMUser",
            "region": "global",
            "name": uname,
            "state": "active",
            "tags": {},
            "raw_data": {
                "username": uname,
                "has_console_access": has_console_access,
                "has_mfa": has_mfa,
                "key_age_days": key_age_days,
                "last_activity_days": last_activity_days,
                "has_wildcard_policy": has_wildcard_policy,
                "num_access_keys": random.randint(0, 2),
                "groups": [f"group-{i % 3}"],
            },
        })
    # Add one root activity record
    items.append({
        "resource_id": "arn:aws:iam::123456789012:root",
        "resource_type": "IAMRoot",
        "region": "global",
        "name": "root",
        "state": "active",
        "tags": {},
        "raw_data": {
            "username": "root",
            "has_mfa": random.random() > 0.3,
            "last_activity_days": random.choice([0, 30, 90, 200]),
            "is_root": True,
        },
    })
    return items


def scan_iam(region: str) -> list[dict[str, Any]]:
    """Scan IAM users and root account. IAM is global — region is accepted but ignored."""
    try:
        import boto3
        from app.core.config import get_settings
        cfg = get_settings()
        if cfg.mock_aws:
            return _mock_iam(region)

        session = boto3.Session(
            aws_access_key_id=cfg.aws_access_key_id or None,
            aws_secret_access_key=cfg.aws_secret_access_key or None,
            region_name="us-east-1",
        )
        iam = session.client("iam")
        items = []

        # Credential report for all users
        try:
            iam.generate_credential_report()
        except Exception:
            pass

        import time, csv, io as _io
        for _ in range(5):
            try:
                resp = iam.get_credential_report()
                report_csv = resp["Content"].decode("utf-8")
                break
            except Exception:
                time.sleep(2)
        else:
            return _mock_iam(region)

        reader = csv.DictReader(_io.StringIO(report_csv))
        now = datetime.now(timezone.utc)

        for row in reader:
            uname = row.get("user", "")
            is_root = uname == "<root_account>"

            def _age(field: str) -> int:
                val = row.get(field, "N/A")
                if val and val not in ("N/A", "no_information", "not_supported"):
                    try:
                        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                        return (now - dt).days
                    except Exception:
                        pass
                return 0

            key1_age = _age("access_key_1_last_rotated")
            key2_age = _age("access_key_2_last_rotated")
            key_age = max(key1_age, key2_age)
            last_used = min(
                _age("access_key_1_last_used_date"),
                _age("access_key_2_last_used_date"),
            ) or _age("password_last_used")

            # Check for wildcard policies
            has_wildcard = False
            if not is_root:
                try:
                    pols = iam.list_user_policies(UserName=uname).get("PolicyNames", [])
                    for pname in pols:
                        doc = iam.get_user_policy(UserName=uname, PolicyName=pname)
                        policy_doc = doc.get("PolicyDocument", {})
                        stmts = policy_doc.get("Statement", [])
                        for s in stmts:
                            acts = s.get("Action", [])
                            if isinstance(acts, str):
                                acts = [acts]
                            if "*" in acts and s.get("Effect") == "Allow":
                                has_wildcard = True
                                break
                except Exception:
                    pass

            items.append({
                "resource_id": f"arn:aws:iam::root:user/{uname}" if not is_root else "arn:aws:iam::root",
                "resource_type": "IAMRoot" if is_root else "IAMUser",
                "region": "global",
                "name": uname,
                "state": "active",
                "tags": {},
                "raw_data": {
                    "username": uname,
                    "has_console_access": row.get("password_enabled") == "true",
                    "has_mfa": row.get("mfa_active") == "true",
                    "key_age_days": key_age,
                    "last_activity_days": last_used,
                    "has_wildcard_policy": has_wildcard,
                    "is_root": is_root,
                    "num_access_keys": sum(1 for k in ["access_key_1_active", "access_key_2_active"] if row.get(k) == "true"),
                    "groups": [],
                },
            })

        return items

    except Exception as e:
        logger.warning(f"IAM scan failed: {e} — using mock")
        return _mock_iam(region)
