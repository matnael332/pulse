"""pulse-server: run the site, its worker, or apply the database migrations.

    uv run pulse-server serve [--migrate]     # http://127.0.0.1:8100 (PORT set: 0.0.0.0:PORT)
    uv run pulse-server worker                # uploads, ingestion and pipeline runs, in turn
    uv run pulse-server migrate

Settings come from ``PULSE_*`` variables or ``.env`` (see .env.example). Exit codes: 0 done,
2 the settings are invalid (the message says what to set).
"""

from __future__ import annotations

import argparse
import os
import sys

from pydantic import ValidationError

from pulse_server.settings import Settings

DEFAULT_PORT = 8100


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pulse-server", description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["serve", "worker", "migrate"])
    parser.add_argument("--migrate", action="store_true", help="apply migrations, then serve")
    args = parser.parse_args(argv)
    try:
        settings = Settings()
    except ValidationError as exc:
        for error in exc.errors():
            print(f"settings: {error['msg']}", file=sys.stderr)
        return 2
    if args.command == "migrate" or args.migrate:
        from pulse_server.migrate import upgrade

        upgrade(settings.database_url)
    if args.command == "worker":
        from pulse_server.worker import main as worker

        worker(settings)
    if args.command == "serve":
        import uvicorn

        from pulse_server.app import create_app

        host = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"
        port = int(os.getenv("PORT", str(DEFAULT_PORT)))
        uvicorn.run(create_app(settings), host=host, port=port, proxy_headers=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
