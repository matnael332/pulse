"""The business copilot's tools: what a company may ask of one finished run. Read-only.

Each tool returns a JSON-friendly dict with a ``source`` list. Accounts are named only by their
pseudonym (``acc_000123``): never a name or the company's own account number, which the browser
swaps in after the answer. Probabilities are percent strings and money is whole units with the
currency, so the model copies numbers instead of computing them (``ungrounded`` checks it).
Reasons, levels and data groups carry the words the reader's screen uses (the glossary the browser
sends), falling back to their codes. No ``from __future__ import annotations`` here: google-genai
reads the type hints at runtime.
"""

from collections.abc import Callable
from dataclasses import dataclass, field

from pulse_core.reporting.fmt import pct

LEVELS = ("high", "elevated", "normal")
GROUPS = ("entered_high", "rose", "gone")
MAX_LIST = 25


@dataclass
class Context:
    """One run, as the business view and the changes have it."""

    accounts: list[dict]  # results._business()["accounts"]: read, never changed
    currency: str
    snapshot_date: str | None
    changes: dict | None = None  # changes.compare() against the base, or None
    before: dict[str, dict] | None = None  # the base run's accounts by id, or None
    base_snapshot: str | None = None
    report: dict = field(default_factory=dict)  # the preflight report (windows, cancellations)
    groups: dict = field(default_factory=dict)  # the contract's data groups (missing, their cost)
    glossary: dict[str, str] = field(default_factory=dict)  # "reason.<code>" -> the screen's words


def build_tools(context: Context) -> list[Callable]:
    """The tool functions for one question, bound to one run."""
    by_id = {a["id"]: a for a in context.accounts}

    def word(kind: str, code: str | None) -> str | None:
        return None if code is None else context.glossary.get(f"{kind}.{code}", code)

    def money(value: int | None) -> str | None:
        return None if value is None else f"{value:,} {context.currency}"

    def reasons(account: dict) -> list[dict]:
        return [
            {
                "reason": word("reason", r.get("code")),
                "value": r.get("value"),
                "typical": r.get("typical"),
            }
            for r in account.get("reasons") or []
        ]

    def brief(account: dict) -> dict:
        return {
            "id": account["id"],
            "rank": account["rank"],
            "level": word("level", account["level"]),
            "probability": pct(account["probability"]),
            "monthly_revenue": money(account.get("mrr")),
            "reasons": [r["reason"] for r in reasons(account)],
        }

    def list_accounts_at_risk(level: str = "high", limit: int = 10) -> dict:
        """The accounts at one risk level (high, elevated or normal), riskiest first: how many
        there are, their monthly revenue together, and the first `limit` of them with their
        reasons. Use it for "who is at risk", "how many" and "how much revenue is at risk"."""
        if level not in LEVELS:
            return {"error": f"level must be one of {', '.join(LEVELS)}", "source": ["scores"]}
        chosen = [a for a in context.accounts if a["level"] == level]
        revenue = [a.get("mrr") for a in chosen]
        return {
            "level": word("level", level),
            "accounts_at_this_level": len(chosen),
            "accounts_scored": len(context.accounts),
            "monthly_revenue_at_this_level": None if None in revenue else money(sum(revenue)),
            "data_as_of": context.snapshot_date,
            "accounts": [brief(a) for a in chosen[: max(1, min(limit, MAX_LIST))]],
            "source": ["scores", "reasons"],
        }

    def get_account(account_id: str) -> dict:
        """One account by its id (like acc_000123): its risk level, how likely it is to leave,
        its rank among all accounts, its monthly revenue, the reasons behind the score (its value
        against the typical one), and its level last month when there is a month to compare."""
        account = by_id.get(account_id.strip())
        if account is None:
            return {"error": f"no account {account_id!r} in this run", "source": ["scores"]}
        answer = {
            **brief(account),
            "rank_of": len(context.accounts),
            "reasons": reasons(account),
            "source": ["scores", "reasons"],
        }
        if context.before is not None:
            was = context.before.get(account["id"])
            answer["last_month"] = (
                {"level": word("level", was["level"]), "probability": pct(was["probability"])}
                if was
                else "not in last month's data (a new account)"
            )
        return answer

    def get_changes(group: str = "") -> dict:
        """What changed since the previous month: the accounts that entered high risk
        (entered_high), whose risk went up (rose), and that were at risk and are no longer in the
        data, most likely cancelled (gone). Leave group empty for all three."""
        if context.changes is None:
            return {"error": "no earlier month to compare with", "source": ["runs"]}
        if group and group not in GROUPS:
            return {"error": f"group must be one of {', '.join(GROUPS)}", "source": ["runs"]}
        answer = {
            "compared_with_data_as_of": context.base_snapshot,
            "counts": context.changes["counts"],
            "source": ["scores", "runs"],
        }
        for name in [group] if group else GROUPS:
            answer[name] = [
                {
                    "id": item["id"],
                    "level_now": word("level", item["level"]),
                    "level_before": word("level", item["level_before"]),
                    "probability_now": pct(item["probability"])
                    if item["probability"] is not None
                    else None,
                    "probability_before": pct(item["probability_before"])
                    if item["probability_before"] is not None
                    else None,
                }
                for item in context.changes[name][:MAX_LIST]
            ]
        return answer

    def get_data_gaps() -> dict:
        """What the data behind this run lacks or limits: the data groups that were not
        received and how much accuracy each costs, whether the result has low confidence, the
        months the model learnt and was tested on, and how many cancellations it saw."""
        cost = context.groups.get("accuracy_cost") or {}
        return {
            "data_as_of": context.snapshot_date,
            "missing_groups": [
                {"group": word("group", g), "accuracy_cost": cost.get(g)}
                for g in context.groups.get("missing") or []
            ],
            "low_confidence": bool(context.report.get("low_confidence")),
            "windows": context.report.get("windows"),
            "cancellations": context.report.get("cancellations"),
            "source": ["dataset_contract", "preflight"],
        }

    return [list_accounts_at_risk, get_account, get_changes, get_data_gaps]
