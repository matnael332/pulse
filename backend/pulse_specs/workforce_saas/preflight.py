"""Can this export be modelled, and with which spec? Run on the normalised target tables.

- The core groups must be there (``make_spec`` says which are missing).
- The snapshot is the day after the last complete day of activity (punches and usage).
- Training starts with the first billed month.
- The test window is 6 months when the history allows it; otherwise it shrinks down to 3 months
  and the spec is marked low confidence. Each window also needs enough cancellations to learn
  from and to measure on. If nothing fits, the export is refused with the numbers that fall short.
- Industry, region and plan keep the customer's own categories.

Returns the ``make_spec`` keyword arguments (``spec_params``) and a report for the person who
approves the run.
"""

from __future__ import annotations

import pandas as pd

from pulse_ingest.contract import PreflightError
from pulse_specs.workforce_saas import columns as wf
from pulse_specs.workforce_saas.clean import HORIZON
from pulse_specs.workforce_saas.spec import check_groups, windows

TEST_MONTHS = (6, 5, 4, 3)
MIN_TRAIN_CANCELLATIONS = 10
MIN_TEST_CANCELLATIONS = 5


def _cancellations(cancelled: pd.Series, window: tuple[str, str]) -> int:
    """Accounts cancelled within the horizon of a month end inside ``window``."""
    start = pd.Timestamp(window[0])
    end = pd.Timestamp(window[1]) + pd.Timedelta(days=1)
    return int(((cancelled > start) & (cancelled <= end + HORIZON)).sum())


def preflight(tables: dict[str, pd.DataFrame], groups: tuple[str, ...]) -> dict:
    unknown = sorted(set(groups) - set(wf.ALL_GROUPS))
    missing = [g for g in wf.CORE_GROUPS if g not in groups]
    try:
        groups = check_groups(groups)
    except ValueError as exc:
        code, params = ("unknown_groups", unknown) if unknown else ("core_groups_missing", missing)
        raise PreflightError(str(exc), code, groups=params) from exc
    last = max(
        tables["punches"]["punched_at"].max(),
        tables["usage_daily"]["usage_date"].max(),
    )
    if pd.isna(last):
        raise PreflightError(
            "no punch or usage dates: cannot tell when the export ends", "no_activity_dates"
        )
    snapshot = (last.normalize() + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    first_bill = tables["billing_monthly"]["period"].min()
    if pd.isna(first_bill):
        raise PreflightError(
            "no billing periods: cannot tell when the history starts", "no_billing_periods"
        )
    train_start = first_bill.to_period("M").start_time.strftime("%Y-%m-%d")
    cancelled = tables["accounts"]["cancelled_at"]
    tried, counts = [], {}
    for test_months in TEST_MONTHS:
        try:
            split = windows(snapshot, train_start, test_months)
        except ValueError as exc:
            tried.append(f"{test_months}-month test window: {exc}")
            continue
        train = _cancellations(cancelled, split["train"])
        test = _cancellations(cancelled, split["test"])
        counts[test_months] = {"train": train, "test": test}
        if train >= MIN_TRAIN_CANCELLATIONS and test >= MIN_TEST_CANCELLATIONS:
            break
        tried.append(
            f"{test_months}-month test window: {train} cancellations to train on "
            f"(need {MIN_TRAIN_CANCELLATIONS}), {test} to test on (need {MIN_TEST_CANCELLATIONS})"
        )
    else:
        raise PreflightError(
            f"not enough history from {train_start} to the snapshot {snapshot}: "
            + "; ".join(tried),
            "not_enough_history",
            train_start=train_start,
            snapshot=snapshot,
            cancellations=list(counts.values())[-1] if counts else None,  # the last tried
            need_train=MIN_TRAIN_CANCELLATIONS,
            need_test=MIN_TEST_CANCELLATIONS,
        )
    allowed = {}
    for table, column in (
        ("accounts", "industry"),
        ("accounts", "region"),
        ("billing_monthly", "plan"),
    ):
        values = tables[table][column].dropna().astype(str).str.strip().str.lower()
        allowed[column] = sorted(set(values) - {""})
    params = {
        "snapshot_date": snapshot,
        "train_start": train_start,
        "test_months": test_months,
        "groups": list(groups),
        "allowed_values": allowed,
        "low_confidence": test_months < TEST_MONTHS[0],
        "synthetic": False,
        "source": "customer export (pulse ingestion)",
    }
    report = {
        "groups_present": list(groups),
        "groups_missing": [g for g in wf.ALL_GROUPS if g not in groups],
        "snapshot_date": snapshot,
        "train_start": train_start,
        "windows": {k: list(v) for k, v in split.items()},
        "cancellations": {"train": train, "test": test},
        "low_confidence": params["low_confidence"],
        "shorter_windows_tried": tried,
        "accounts": int(tables["accounts"]["account_id"].nunique()),
    }
    return {"spec_params": params, "report": report}
