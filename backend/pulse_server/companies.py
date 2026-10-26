"""A company's life: pending -> active (approved) or rejected; active <-> suspended.

Approving gives the company its slug, the name of its customer folder, and creates the folder
(``pulse_ingest.layout.CustomerDir``). Every decision is in the audit log.
"""

from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from pulse_ingest.layout import CustomerDir
from pulse_server.models import Company, utcnow
from pulse_server.security import audit
from pulse_server.settings import Settings

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
TRANSITIONS = {  # action: (from, to)
    "approve": ("pending", "active"),
    "reject": ("pending", "rejected"),
    "suspend": ("active", "suspended"),
    "reactivate": ("suspended", "active"),
}


class Conflict(Exception):
    """The decision does not fit the company's state, or the slug is taken (409)."""


class InvalidSlug(ValueError):
    """Not a valid folder name (422)."""


def slugify(name: str) -> str | None:
    """Latin letters and digits of the name, hyphenated; None if nothing usable is left."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:63].strip("-")
    return slug if SLUG.match(slug) else None


def decide(
    db: Session,
    company: Company,
    action: str,
    actor: str,
    settings: Settings,
    *,
    slug: str | None = None,
    note: str | None = None,
) -> Company:
    """Apply an operator's decision (committed); approval creates the customer folder."""
    before, after = TRANSITIONS[action]
    if company.status != before:
        raise Conflict(f"cannot {action} a company that is {company.status}")
    detail: dict = {"from": before, "to": after}
    if action == "approve":
        slug = slug or slugify(company.name) or f"company-{company.id}"
        if not SLUG.match(slug):
            raise InvalidSlug("a slug is 2-63 lower-case letters, digits and hyphens")
        if db.scalar(select(Company.id).where(Company.slug == slug)) is not None:
            raise Conflict(f"the slug {slug} is taken")
        folder = CustomerDir(settings.customers_root / slug)
        if folder.root.exists():
            raise Conflict(f"a customer folder named {slug} already exists")
        folder.create()
        company.slug = slug
        detail["slug"] = slug
    company.status = after
    company.decided_at = utcnow()
    company.decided_by = actor
    if note is not None:
        company.note = note
        detail["note"] = note
    audit(db, actor, f"company.{action}", company.id, **detail)
    db.commit()
    return company
