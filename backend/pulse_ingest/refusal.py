"""Why an export was refused, as a stable code the site can word in Hebrew or English.

``UnsafeArchive``, ``MappingError`` and ``PreflightError`` are ``Refused``: the message stays the
English sentence the CLI prints, and ``code`` with ``params`` is what the site shows.
"""

from __future__ import annotations


class Refused(ValueError):
    def __init__(self, message: str, code: str, **params) -> None:
        super().__init__(message)
        self.code = code
        self.params = params
