"""Each scored account's monthly revenue, and how much of it is at high risk.

The revenue comes from the rows that were scored (``score_rows.csv``, the newest month of each
account), matched to the scores by ``account_month_id``. Only the one figure per account is
read; the file itself is never served.
"""

from __future__ import annotations

import csv
from pathlib import Path


def scored_mrr(artifacts: Path) -> dict[str, int | None]:
    """account id -> its monthly revenue in whole units (None if blank); {} if not recorded."""
    scores_path, rows_path = artifacts / "scores_current.csv", artifacts / "score_rows.csv"
    if not scores_path.exists() or not rows_path.exists():
        return {}
    with open(scores_path, encoding="utf-8", newline="") as handle:
        scored = {r["account_month_id"]: r["account_id"] for r in csv.DictReader(handle)}
    mrr: dict[str, int | None] = {}
    with open(rows_path, encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if "mrr" not in (reader.fieldnames or []):
            return {}
        for row in reader:
            account = scored.get(row["account_month_id"])
            if account is not None:
                mrr[account] = _whole(row["mrr"])
    return mrr


def revenue(levels: dict[str, str], mrr: dict[str, int | None]) -> dict[str, int | None]:
    """Revenue at high risk and in total; None when any account it sums has no revenue."""
    if not mrr:
        return {"revenue_at_risk": None, "revenue_total": None}
    return {
        "revenue_at_risk": _sum(mrr.get(a) for a, level in levels.items() if level == "high"),
        "revenue_total": _sum(mrr.get(a) for a in levels),
    }


def _whole(value: str) -> int | None:
    try:
        return round(float(value))
    except (ValueError, OverflowError):  # blank, text, nan or inf
        return None


def _sum(values) -> int | None:
    total = 0
    for value in values:
        if value is None:
            return None
        total += value
    return total
