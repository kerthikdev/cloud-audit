from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.core.security import get_current_user, require_admin
from app.utils.aws_client_factory import get_boto3_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])

from app.core.config import get_settings as _get_app_settings

_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"


def _persist_to_env(key_id: str, secret: str, region: str, scan_regions: list[str], mock: bool) -> None:
    """Write credentials into .env so they survive backend restarts."""
    updates = {
        "MOCK_AWS": "false" if not mock else "true",
        "AWS_ACCESS_KEY_ID": key_id,
        "AWS_SECRET_ACCESS_KEY": secret,
        "AWS_REGION": region,
        "SCAN_REGIONS": ",".join(scan_regions),
    }
    try:
        text = _ENV_FILE.read_text(encoding="utf-8") if _ENV_FILE.exists() else ""
        for k, v in updates.items():
            pattern = rf"^{k}=.*$"
            replacement = f"{k}={v}"
            if re.search(pattern, text, re.MULTILINE):
                text = re.sub(pattern, replacement, text, flags=re.MULTILINE)
            else:
                text = text.rstrip("\n") + f"\n{replacement}\n"
        _ENV_FILE.write_text(text, encoding="utf-8")
        logger.info("Credentials persisted to .env")
    except Exception as e:
        logger.warning(f"Could not write .env: {e}")


def _init_config() -> dict:
    cfg = _get_app_settings()
    return {
        "mock_aws": cfg.mock_aws,
        "aws_access_key_id": cfg.aws_access_key_id or None,
        "aws_secret_access_key": cfg.aws_secret_access_key or None,
        "aws_region": cfg.aws_default_region,
        "scan_regions": cfg.scan_regions_list,
        "schedule_cron": cfg.schedule_cron or "",
        "slack_webhook_url": cfg.slack_webhook_url or "",
    }


_current_config: dict = _init_config()


class AWSCredentials(BaseModel):
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "us-east-1"
    scan_regions: list[str] = ["us-east-1"]

    @field_validator("aws_access_key_id")
    @classmethod
    def key_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Access key ID cannot be empty")
        return v.strip()

    @field_validator("aws_secret_access_key")
    @classmethod
    def secret_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Secret access key cannot be empty")
        return v.strip()


class ScheduleRequest(BaseModel):
    cron: str  # e.g. "0 */6 * * *" or "" to disable

class WebhookRequest(BaseModel):
    slack_webhook_url: str


class SettingsResponse(BaseModel):
    mock_aws: bool
    aws_region: Optional[str]
    scan_regions: list[str]
    aws_access_key_id_hint: Optional[str]
    connected: bool
    schedule_cron: Optional[str]
    slack_webhook_url: Optional[str]


def _mask_key(key: str | None) -> str | None:
    if not key:
        return None
    return key[:4] + "****" + key[-4:]


def _test_connection(key_id: str, secret: str, region: str) -> tuple[bool, str]:
    try:
        import boto3
        from botocore.config import Config as BotocoreConfig
        session = boto3.Session(
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            region_name=region,
        )
        sts = session.client(
            "sts",
            config=BotocoreConfig(connect_timeout=10, read_timeout=10, retries={"max_attempts": 1}),
        )
        identity = sts.get_caller_identity()
        account = identity.get("Account", "unknown")
        arn = identity.get("Arn", "unknown")
        return True, f"Connected — Account: {account} | Identity: {arn}"
    except Exception as e:
        err_str = str(e)
        # Provide friendlier messages for common errors
        if "InvalidClientTokenId" in err_str or "InvalidAccessKeyId" in err_str:
            return False, "Invalid Access Key ID — check your key and try again"
        if "SignatureDoesNotMatch" in err_str:
            return False, "Invalid Secret Access Key — signature mismatch"
        if "AuthFailure" in err_str or "AccessDenied" in err_str:
            return False, "Access denied — credentials are valid but lack sts:GetCallerIdentity permission"
        if "EndpointResolutionError" in err_str or "ConnectTimeout" in err_str or "connect timeout" in err_str.lower():
            return False, "Network timeout — could not reach AWS. Check your internet connection."
        if "ExpiredToken" in err_str:
            return False, "Credentials have expired — generate new access keys in IAM"
        return False, err_str


@router.get("", response_model=SettingsResponse)
async def get_settings_endpoint(current_user=Depends(get_current_user)) -> SettingsResponse:
    return SettingsResponse(
        mock_aws=_current_config["mock_aws"],
        aws_region=_current_config.get("aws_region"),
        scan_regions=_current_config.get("scan_regions", ["us-east-1"]),
        aws_access_key_id_hint=_mask_key(_current_config.get("aws_access_key_id")),
        connected=not _current_config["mock_aws"] and bool(_current_config.get("aws_access_key_id")),
        schedule_cron=_current_config.get("schedule_cron"),
        slack_webhook_url=_current_config.get("slack_webhook_url"),
    )


@router.post("/aws-credentials")
async def save_aws_credentials(
    payload: AWSCredentials,
    current_user=Depends(get_current_user),
) -> dict[str, Any]:
    ok, message = _test_connection(
        payload.aws_access_key_id,
        payload.aws_secret_access_key,
        payload.aws_region,
    )

    if not ok:
        raise HTTPException(status_code=400, detail=f"AWS credentials validation failed: {message}")

    was_mock = _current_config["mock_aws"]
    _current_config.update({
        "mock_aws": False,
        "aws_access_key_id": payload.aws_access_key_id,
        "aws_secret_access_key": payload.aws_secret_access_key,
        "aws_region": payload.aws_region,
        "scan_regions": payload.scan_regions,
    })
    os.environ["AWS_ACCESS_KEY_ID"] = payload.aws_access_key_id
    os.environ["AWS_SECRET_ACCESS_KEY"] = payload.aws_secret_access_key
    os.environ["AWS_DEFAULT_REGION"] = payload.aws_region
    os.environ["MOCK_AWS"] = "false"

    _persist_to_env(
        payload.aws_access_key_id, payload.aws_secret_access_key,
        payload.aws_region, payload.scan_regions, mock=False,
    )

    if was_mock:
        from app.core import store
        store.clear_all()
        logger.info("Cleared mock scan data — switched to real AWS mode")

    return {
        "success": True,
        "message": message,
        "aws_region": payload.aws_region,
        "scan_regions": payload.scan_regions,
        "key_hint": _mask_key(payload.aws_access_key_id),
    }


@router.post("/use-mock")
async def switch_to_mock(current_user=Depends(get_current_user)) -> dict[str, str]:
    _current_config.update({"mock_aws": True, "aws_access_key_id": None, "aws_secret_access_key": None})
    os.environ["MOCK_AWS"] = "true"
    os.environ.pop("AWS_ACCESS_KEY_ID", None)
    os.environ.pop("AWS_SECRET_ACCESS_KEY", None)
    return {"success": "true", "mode": "mock"}


@router.post("/schedule")
async def set_schedule(payload: ScheduleRequest, current_user=Depends(get_current_user)) -> dict:
    """Set or clear the auto-scan cron schedule."""
    cron = payload.cron.strip()
    if cron and len(cron.split()) != 5:
        raise HTTPException(status_code=400, detail="Invalid cron expression — expected 5 fields (minute hour day month weekday)")

    _current_config["schedule_cron"] = cron
    os.environ["SCHEDULE_CRON"] = cron

    # Restart scheduler with updated cron
    from app.services.scheduler import stop_scheduler, start_scheduler
    stop_scheduler()
    if cron:
        start_scheduler()
        logger.info(f"Schedule updated to: '{cron}'")
    else:
        logger.info("Schedule cleared — auto-scan disabled")

    return {"success": True, "schedule_cron": cron or None, "message": "Schedule updated"}


@router.get("/schedule")
async def get_schedule(current_user=Depends(get_current_user)) -> dict:
    from app.services.scheduler import get_scheduler_status
    return get_scheduler_status()


@router.post("/webhook")
async def set_webhook(payload: WebhookRequest, current_user=Depends(get_current_user)) -> dict:
    """Save Slack webhook URL for critical violation alerts."""
    _current_config["slack_webhook_url"] = payload.slack_webhook_url
    os.environ["SLACK_WEBHOOK_URL"] = payload.slack_webhook_url
    return {"success": True, "message": "Webhook URL saved"}


@router.get("/scan-regions")
async def get_scan_regions(current_user=Depends(get_current_user)) -> dict[str, list[str]]:
    return {"scan_regions": _current_config.get("scan_regions", ["us-east-1"])}
