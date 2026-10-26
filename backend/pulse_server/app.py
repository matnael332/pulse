"""The FastAPI application: ``create_app(settings)``."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from pulse_server.db import make_engine
from pulse_server.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    development = settings.env == "development"
    app = FastAPI(
        title="pulse server",
        docs_url="/docs" if development else None,
        redoc_url=None,
        openapi_url="/openapi.json" if development else None,
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.sessions = sessionmaker(app.state.engine, expire_on_commit=False)

    @app.get("/health")
    def health(request: Request):
        try:
            with request.app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as exc:  # noqa: BLE001 - any database failure is "not healthy"
            return JSONResponse({"status": "degraded", "db": type(exc).__name__}, 503)
        return {"status": "ok", "db": "ok"}

    return app
