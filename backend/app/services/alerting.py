"""
Slack / webhook alerting for critical violations.
Sends a formatted message when a scan completes with CRITICAL findings.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _build_slack_message(scan_id: str, violations: list[dict[str, Any]]) -> dict:
    critical = [v for v in violations if (v.get("severity") or "").upper() == "CRITICAL"]
    high = [v for v in violations if (v.get("severity") or "").upper() == "HIGH"]

    lines = [
        f"*🚨 Cloud Audit Alert — Scan `{scan_id[:8]}`*",
        f"Found *{len(critical)} CRITICAL* and *{len(high)} HIGH* violations.\n",
    ]

    for v in critical[:5]:  # show up to 5 critical violations
        lines.append(f"• `{v.get('rule_id', '?')}` — {v.get('resource_type', '')} `{v.get('resource_id', '')[:20]}` in _{v.get('region', '')}_")
        lines.append(f"  _{v.get('message', '')[:120]}_\n")

    if len(critical) > 5:
        lines.append(f"…and {len(critical) - 5} more critical violations.")

    return {
        "text": f"🚨 Cloud Audit: {len(critical)} CRITICAL violations found",
        "blocks": [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": "\n".join(lines)},
            },
            {
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"Scan ID: `{scan_id}` | Total violations: {len(violations)}"}],
            },
        ],
    }


def send_critical_alerts(scan_id: str, violations: list[dict[str, Any]]) -> None:
    """
    Send Slack notification if there are CRITICAL or HIGH violations.
    Silently skips if SLACK_WEBHOOK_URL is not configured.
    """
    settings = get_settings()
    if not settings.slack_webhook_url:
        return

    critical_count = sum(1 for v in violations if (v.get("severity") or "").upper() == "CRITICAL")
    if critical_count == 0:
        return

    try:
        payload = _build_slack_message(scan_id, violations)
        response = httpx.post(
            settings.slack_webhook_url,
            content=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        logger.info(f"Slack alert sent for scan {scan_id} ({critical_count} critical violations)")
    except Exception as e:
        logger.warning(f"Failed to send Slack alert: {e}")
