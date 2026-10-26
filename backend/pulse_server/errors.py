"""What went wrong, for the company: a stable code with params (the site words it in Hebrew or
English). The detail (an exception, a traceback) goes to the log and the job row, never to the
company.
"""

from __future__ import annotations

import zipfile

from fastapi import HTTPException
from pandas.errors import EmptyDataError, ParserError

from pulse_ingest.refusal import Refused

# An export the readers cannot parse: the customer's file, not our bug.
UNREADABLE = (ParserError, EmptyDataError, UnicodeDecodeError, zipfile.BadZipFile)


class StepFailed(Exception):
    """A step of the worker ended for a reason the company should see."""

    def __init__(self, code: str, detail: str = "", **params) -> None:
        super().__init__(detail or code)
        self.code = code
        self.params = params


def refusal(exc: BaseException) -> tuple[str, dict]:
    """The company-facing code of an exception raised while reading or applying an export."""
    if isinstance(exc, Refused):
        return exc.code, exc.params
    if isinstance(exc, UNREADABLE) or type(exc).__module__.startswith("openpyxl"):
        return "export_unreadable", {}
    return "internal", {}


def http_error(status: int, code: str, **params) -> HTTPException:
    return HTTPException(status, {"code": code, "params": params})
