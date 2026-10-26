"""The FastAPI application: ``create_app(settings)``."""

from __future__ import annotations

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from pulse_server import account, admin, auth
from pulse_server.db import make_engine
from pulse_server.oidc import OidcClient
from pulse_server.security import guard
from pulse_server.settings import Settings
from pulse_server.site import mount_site


def create_app(
    settings: Settings | None = None, *, oidc_transport: httpx.BaseTransport | None = None
) -> FastAPI:
    """The app; ``oidc_transport`` replaces the network to the sign-in providers (tests)."""
    settings = settings or Settings()
    development = settings.env == "development"
    app = FastAPI(
        title="pulse server",
        docs_url="/api/docs" if development else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if development else None,
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.sessions = sessionmaker(app.state.engine, expire_on_commit=False)
    app.state.oidc = OidcClient(oidc_transport)
    app.middleware("http")(guard)
    app.include_router(auth.router)
    app.include_router(auth.browser_router)
    if settings.dev_login:
        app.include_router(auth.dev_router)
    app.include_router(account.router)
    app.include_router(admin.router)

    @app.get("/health")
    def health(request: Request):
        try:
            with request.app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as exc:  # noqa: BLE001 - any database failure is "not healthy"
            return JSONResponse({"status": "degraded", "db": type(exc).__name__}, 503)
        return {"status": "ok", "db": "ok"}

    mount_site(app, settings.web_dir)
    return app
