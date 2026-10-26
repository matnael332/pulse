"""The server's settings: ``PULSE_*`` environment variables (or ``.env``).

Production is the default: the dev login cannot be switched on there, and the secret key that
signs the sign-in state is required. A provider (Google, Microsoft) is enabled when both its
client id and secret are set.
"""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PULSE_", env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    env: Literal["development", "production"] = "production"
    dev_login: bool = False
    database_url: str = "sqlite:///./var/pulse-server.db"
    customers_root: Path = Path("customers")
    public_url: str = "http://localhost:8100"
    secret_key: str = ""
    operator_emails: str = ""  # comma-separated
    google_client_id: str = ""
    google_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_tenant: str = "organizations"  # work and school accounts, any organisation
    session_days: int = 14

    @model_validator(mode="after")
    def _safe(self) -> Settings:
        if self.env == "production":
            if self.dev_login:
                raise ValueError("PULSE_DEV_LOGIN cannot be on with PULSE_ENV=production")
            if len(self.secret_key) < MIN_SECRET_LENGTH:
                raise ValueError(
                    f"PULSE_SECRET_KEY must be set (at least {MIN_SECRET_LENGTH} characters), e.g."
                    ' python -c "import secrets; print(secrets.token_urlsafe(48))"'
                )
        elif not self.secret_key:
            self.secret_key = secrets.token_urlsafe(48)  # development: one per process
        return self

    @property
    def operators(self) -> frozenset[str]:
        return frozenset(e.strip().lower() for e in self.operator_emails.split(",") if e.strip())

    @property
    def https(self) -> bool:
        return urlsplit(self.public_url).scheme == "https"

    @property
    def origin(self) -> str:
        parts = urlsplit(self.public_url)
        return f"{parts.scheme}://{parts.netloc}"
