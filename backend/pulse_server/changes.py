"""What changed for a company's accounts since the previous month.

A run is compared with its base: the company's run of the latest snapshot before its own (the
previous month; a second upload of the same month is not a month), of the same kind (the demo has
its own folder and pseudonyms, so demo and real are never compared), that succeeded and still has
its scores on disk. The accounts that changed fall into one group each:

- ``entered_high``: at high risk now, and not before (or not in the data before);
- ``rose``: a higher level that is not high, so from normal to elevated;
- ``gone``: at risk before (high or elevated) and not among the accounts scored now, most likely
  cancelled (an account also drops out of the scores when it was not billed in the last month).

Every run trains its own model, so a change of level is partly the model's; the probabilities
before and after are served next to the levels.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from pulse_server import jobs
from pulse_server.models import Company, Ingestion, Run
from pulse_server.settings import Settings

ORDER = {"normal": 0, "elevated": 1, "high": 2}
AT_RISK = ("high", "elevated")
GROUPS = ("entered_high", "rose", "gone")


def snapshot_of(run: Run) -> str | None:
    """The day the run's data ends (YYYY-MM-DD), from its summary or its ingestion's report."""
    return (run.summary or {}).get("snapshot_date") or (run.ingestion.report or {}).get(
        "snapshot_date"
    )


def artifacts_of(settings: Settings, company: Company, run: Run) -> Path:
    folder = jobs.customer_folder(settings, company, run.ingestion.demo)
    return folder.runs / run.id / "artifacts"


def base_run(db: Session, settings: Settings, company: Company, run: Run) -> Run | None:
    """The run ``run`` is compared with, or None (the first month, or the demo).

    Dated runs go by snapshot (ISO dates compare as text), the newest finished first on a tie;
    when either side has no snapshot, an earlier run of another upload counts instead.
    """
    snapshot = snapshot_of(run)
    candidates = db.scalars(
        select(Run)
        .join(Run.ingestion)
        .where(
            Run.company_id == company.id,
            Run.status == "succeeded",
            Run.id != run.id,
            Ingestion.demo == run.ingestion.demo,
        )
    ).all()

    def earlier(other: Run) -> bool:
        theirs = snapshot_of(other)
        if snapshot is not None and theirs is not None:
            return theirs < snapshot
        return other.ingestion_id != run.ingestion_id and other.created_at < run.created_at

    usable = [
        other
        for other in candidates
        if earlier(other)
        and (artifacts_of(settings, company, other) / "scores_current.csv").exists()
    ]
    if not usable:
        return None
    return max(usable, key=lambda o: (snapshot_of(o) or "", o.finished_at or o.created_at))


def run_ref(run: Run | None) -> dict | None:
    """What the screens show of a base run: its dates and its summary."""
    if run is None:
        return None
    return {
        "id": run.id,
        "snapshot_date": snapshot_of(run),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "created_at": run.created_at.isoformat(),
        "summary": run.summary,
    }


def compare(now: list[dict], before: list[dict]) -> dict:
    """The accounts of each group, by rank, with their figures now and before, and the counts.

    ``now`` and ``before`` are the business view's accounts (``results._business``, cached: they
    are read, never changed).
    """
    prior = {account["id"]: account for account in before}
    scored = {account["id"] for account in now}
    groups: dict[str, list[dict]] = {group: [] for group in GROUPS}
    for account in sorted(now, key=lambda a: a["rank"]):
        was = prior.get(account["id"])
        if account["level"] == "high" and (was is None or was["level"] != "high"):
            groups["entered_high"].append(_item(account, was))
        elif was is not None and ORDER.get(account["level"], 0) > ORDER.get(was["level"], 0):
            groups["rose"].append(_item(account, was))
    for was in sorted(before, key=lambda a: a["rank"]):
        if was["id"] not in scored and was["level"] in AT_RISK:
            groups["gone"].append(_item(None, was))
    return {"counts": {group: len(items) for group, items in groups.items()}, **groups}


def nothing() -> dict:
    """No base to compare with: empty groups."""
    return compare([], [])


def _item(now: dict | None, was: dict | None) -> dict:
    current, previous = now or {}, was or {}
    known = now or was or {}
    return {
        "id": known.get("id"),
        "customer_id": known.get("customer_id"),
        "name": known.get("name"),
        "level": current.get("level"),
        "probability": current.get("probability"),
        "rank": current.get("rank"),
        "mrr": current.get("mrr"),
        "reasons": current.get("reasons", []),
        "level_before": previous.get("level"),
        "probability_before": previous.get("probability"),
        "rank_before": previous.get("rank"),
        "mrr_before": previous.get("mrr"),
    }
