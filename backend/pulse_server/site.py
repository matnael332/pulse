"""The web site (``web/``, built by Vite into ``PULSE_WEB_DIR``), served by the server itself.

``/assets/*`` are content-hashed files, cached for a year. Any other path that is not the API, the
sign-in or /health gets the site's own file (``favicon.svg``...) or ``index.html``, and the
browser-side router takes it from there. The page carries a strict Content-Security-Policy:
everything from this origin only, no inline scripts.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",  # the component library sets style attributes
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)
NOT_SITE = ("api", "auth", "assets")
METHODS = ("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE")


def mount_site(app: FastAPI, web_dir: Path) -> None:
    """Register last: every route before it wins."""
    root = web_dir.resolve()
    if (root / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    @app.api_route("/api/{path:path}", methods=list(METHODS), include_in_schema=False)
    def no_such_api(path: str) -> None:
        raise HTTPException(404, "not found")  # any method: an unknown API path is 404, not 405

    @app.get("/{path:path}", include_in_schema=False)
    def site(path: str) -> FileResponse:
        if path.split("/", 1)[0] in NOT_SITE:
            raise HTTPException(404, "not found")
        index = root / "index.html"
        if not index.is_file():
            raise HTTPException(404, f"the web site is not built (npm run build in web/): {root}")
        file = (root / path).resolve()
        if path and file.is_file() and file.is_relative_to(root):
            return FileResponse(file)
        return FileResponse(index, headers={"Content-Security-Policy": CSP})
