from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_env: str = "development"
    app_port: int = 8000
    app_version: str = "1.0.0"
    secret_key: str = "dev-secret-key-change-in-production-please"
    debug: bool = True

    # Auth / JWT
    jwt_secret_key: str = "jwt-super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    api_key: str = ""  # Optional static API key for programmatic access

    # AWS
    mock_aws: bool = True
    aws_default_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_session_token: str = ""
    aws_role_arn: str = ""

    # Scanner
    scan_regions: str = "us-east-1,us-west-2"

    # Database
    db_url: str = "sqlite:///./scan_data.db"

    # Scheduling
    schedule_cron: str = ""          # e.g. "0 */6 * * *" — empty = disabled
    schedule_regions: str = ""       # overrides scan_regions for scheduled scans

    # Alerting
    slack_webhook_url: str = ""

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Logging
    log_level: str = "INFO"
    log_format: str = "json"

    @property
    def scan_regions_list(self) -> List[str]:
        return [r.strip() for r in self.scan_regions.split(",") if r.strip()]

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


def get_settings() -> Settings:
    """Return settings, reading env variables fresh (no module-level cache).
    
    Note: We intentionally do NOT use @lru_cache here because credentials
    can be updated at runtime via the Settings UI (written to os.environ),
    and we need those changes to be immediately reflected. Each call reads
    from the current environment state.
    """
    return Settings()
