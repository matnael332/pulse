"""What changed since the previous month: the run compared with, and the accounts that entered high
risk, rose in risk, or are no longer in the data; each account in one group at most."""

from datetime import UTC, datetime, timedelta

import pytest

from pulse_ingest.layout import CustomerDir
from pulse_server.changes import compare
from pulse_server.models import Ingestion, Run
from tests.server_helpers import activate, db_session

START = datetime(2026, 9, 1, tzinfo=UTC)
MAP = "pseudo_id,source_id,name\nacc_000001,10001,מאפיית הגליל\nacc_000002,10002,מוסך הדרום\n"


def _account(account_id: str, level: str, rank: int, probability: float = 0.5) -> dict:
    return {
        "id": account_id,
        "customer_id": account_id[-2:],
        "name": f"name {account_id}",
        "level": level,
        "probability": probability,
        "rank": rank,
        "mrr": 100 * rank,
        "reasons": [],
    }


def _done(
    settings,
    company,
    run_id,
    *,
    snapshot,
    accounts,
    upload=None,
    demo=False,
    day=0,
    status="succeeded",
    files=True,
):
    """A run of an applied upload, finished ``day`` days after START, with its scores on disk.

    ``accounts``: account id -> (risk level, probability, monthly revenue), in rank order.
    """
    upload = upload or f"ing-{run_id}"
    finished = START + timedelta(days=day)
    with db_session(settings) as db:
        if db.get(Ingestion, upload) is None:
            db.add(
                Ingestion(
                    id=upload,
                    company_id=company["id"],
                    filename="x.zip",
                    language="he",
                    status="applied",
                    demo=demo,
                    report={"snapshot_date": snapshot} if snapshot else {},
                    created_at=finished,
                )
            )
        summary = {"accounts": len(accounts), "snapshot_date": snapshot}
        db.add(
            Run(
                id=run_id,
                company_id=company["id"],
                ingestion_id=upload,
                language="he",
                status=status,
                summary=summary if status == "succeeded" else None,
                created_at=finished,
                finished_at=finished if status != "queued" else None,
            )
        )
        db.commit()
    folder = CustomerDir(settings.customers_root / "acme" / ("demo" if demo else ""))
    folder.root.mkdir(parents=True, exist_ok=True)
    folder.entity_map.write_text(MAP, encoding="utf-8")
    if not files:
        return run_id
    art = folder.runs / run_id / "artifacts"
    art.mkdir(parents=True)
    scores = ["account_id,account_month_id,month_end,probability,risk_level,rank"]
    rows = ["account_month_id,account_id,month,mrr"]
    for rank, (account, (level, probability, mrr)) in enumerate(accounts.items(), start=1):
        scores.append(f"{account},{account}:m,2025-08-31,{probability},{level},{rank}")
        rows.append(f"{account}:m,{account},2025-08,{mrr}")
    (art / "scores_current.csv").write_text("\n".join(scores) + "\n", encoding="utf-8")
    (art / "score_rows.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    return run_id


def _ids(items: list[dict]) -> list[str]:
    return [item["id"] for item in items]


def test_each_account_that_changed_falls_in_one_group():
    before = [
        _account("acc_a", "normal", 1),  # -> high: entered
        _account("acc_b", "elevated", 2),  # -> high: entered
        _account("acc_c", "high", 3),  # stays high: nothing
        _account("acc_d", "normal", 4),  # -> elevated: rose
        _account("acc_e", "high", 5),  # -> elevated: a fall, nothing
        _account("acc_f", "elevated", 6),  # -> normal: a fall, nothing
        _account("acc_g", "high", 7),  # gone, was at risk
        _account("acc_h", "elevated", 8),  # gone, was at risk
        _account("acc_i", "normal", 9),  # gone, was not at risk: nothing
    ]
    now = [
        _account("acc_new_high", "high", 1, 0.9),  # new and high: entered
        _account("acc_b", "high", 2),
        _account("acc_a", "high", 3),
        _account("acc_c", "high", 4),
        _account("acc_new_elevated", "elevated", 5),  # new and elevated: nothing
        _account("acc_d", "elevated", 6, 0.4),
        _account("acc_e", "elevated", 7),
        _account("acc_f", "normal", 8),
    ]
    changed = compare(now, before)
    assert _ids(changed["entered_high"]) == ["acc_new_high", "acc_b", "acc_a"]
    assert _ids(changed["rose"]) == ["acc_d"]
    assert _ids(changed["gone"]) == ["acc_g", "acc_h"]
    assert changed["counts"] == {"entered_high": 3, "rose": 1, "gone": 2}
    groups = [_ids(changed[g]) for g in ("entered_high", "rose", "gone")]
    assert len({i for ids in groups for i in ids}) == sum(len(ids) for ids in groups)

    new, rose, gone = changed["entered_high"][0], changed["rose"][0], changed["gone"][0]
    assert (new["level"], new["level_before"], new["probability_before"]) == ("high", None, None)
    assert (rose["level_before"], rose["probability"], rose["rank_before"]) == ("normal", 0.4, 4)
    assert (gone["level"], gone["rank"], gone["level_before"], gone["mrr_before"]) == (
        None,
        None,
        "high",
        700,
    )
    assert gone["name"] == "name acc_g" and gone["reasons"] == []


def test_nothing_changes_the_accounts_it_reads():
    before, now = [_account("acc_a", "normal", 1)], [_account("acc_a", "high", 1)]
    copies = [dict(a) for a in before + now]
    compare(now, before)
    assert before + now == copies


@pytest.fixture()
def company(server):
    return activate(server)


def test_the_base_is_the_previous_month_of_the_same_kind(server, server_settings, company):
    s = server_settings
    month = {"acc_000001": ("high", 0.8, 900)}
    _done(s, company, "may", snapshot="2025-06-01", accounts=month, day=0)
    _done(s, company, "july", snapshot="2025-08-01", accounts=month, day=1)
    _done(s, company, "june", snapshot="2025-07-01", accounts=month, day=2)  # uploaded late
    _done(s, company, "aug", snapshot="2025-09-01", accounts=month, day=3)
    _done(s, company, "aug-again", snapshot="2025-09-01", accounts=month, day=4)  # same month
    _done(s, company, "july-failed", snapshot="2025-08-01", accounts=month, day=5, status="failed")
    _done(s, company, "july-gone", snapshot="2025-08-01", accounts=month, day=6, files=False)
    _done(s, company, "demo", snapshot="2025-08-15", accounts=month, day=7, demo=True)

    def base(run_id):
        shown = server.get(f"/api/runs/{run_id}/changes")
        assert shown.status_code == 200
        return (shown.json()["base"] or {}).get("id")

    assert base("aug") == "july"
    assert base("aug-again") == "july"  # a second upload of August is not the previous month
    assert base("july") == "june"  # by the data's month, not by when it was uploaded
    assert base("june") == "may"
    assert base("may") is None
    assert base("demo") is None  # the demo is never compared with the real data


def test_on_a_tie_the_newest_finished_counts(server, server_settings, company):
    s = server_settings
    month = {"acc_000001": ("high", 0.8, 900)}
    _done(s, company, "july-1", snapshot="2025-08-01", accounts=month, day=0)
    _done(s, company, "july-2", snapshot="2025-08-01", accounts=month, day=2)
    _done(s, company, "aug", snapshot="2025-09-01", accounts=month, day=3)
    assert server.get("/api/runs/aug/changes").json()["base"]["id"] == "july-2"


def test_without_dates_the_previous_upload_counts(server, server_settings, company):
    s = server_settings
    month = {"acc_000001": ("high", 0.8, 900)}
    _done(s, company, "first", snapshot=None, accounts=month, day=0)
    _done(s, company, "second", snapshot=None, accounts=month, day=1)
    _done(s, company, "second-again", snapshot=None, accounts=month, day=2, upload="ing-second")
    assert server.get("/api/runs/second/changes").json()["base"]["id"] == "first"
    assert server.get("/api/runs/second-again/changes").json()["base"]["id"] == "first"
    assert server.get("/api/runs/first/changes").json()["base"] is None


def test_the_changes_name_the_accounts_and_match_the_figures(server, server_settings, company):
    s = server_settings
    _done(
        s,
        company,
        "july",
        snapshot="2025-08-01",
        accounts={"acc_000002": ("high", 0.7, 400), "acc_000001": ("normal", 0.1, 900)},
        day=0,
    )
    _done(
        s,
        company,
        "aug",
        snapshot="2025-09-01",
        accounts={"acc_000001": ("high", 0.85, 950), "acc_000003": ("normal", 0.1, 50)},
        day=1,
    )
    shown = server.get("/api/runs/aug/changes").json()
    assert shown["base"]["id"] == "july" and shown["base"]["snapshot_date"] == "2025-08-01"
    assert shown["counts"] == {"entered_high": 1, "rose": 0, "gone": 1}
    entered, gone = shown["entered_high"][0], shown["gone"][0]
    assert (entered["name"], entered["customer_id"], entered["mrr"]) == (
        "מאפיית הגליל",
        "10001",
        950,
    )
    assert (entered["level_before"], entered["probability_before"]) == ("normal", 0.1)
    assert (gone["name"], gone["customer_id"], gone["level_before"]) == (
        "מוסך הדרום",
        "10002",
        "high",
    )
    results = server.get("/api/runs/aug/results").json()
    assert results["previous"] == shown["base"]
    assert results["previous"]["summary"]["accounts"] == 2

    first = server.get("/api/runs/july/changes").json()
    assert first["base"] is None and first["counts"] == {"entered_high": 0, "rose": 0, "gone": 0}
    assert first["entered_high"] == first["rose"] == first["gone"] == []
    assert server.get("/api/runs/july/results").json()["previous"] is None


def test_the_changes_are_ones_own_and_wait_for_the_results(server, server_settings, company):
    s = server_settings
    month = {"acc_000001": ("high", 0.8, 900)}
    _done(s, company, "aug", snapshot="2025-09-01", accounts=month, day=0)
    _done(s, company, "sept", snapshot="2025-10-01", accounts={}, day=1, status="queued")
    waiting = server.get("/api/runs/sept/changes")
    assert waiting.status_code == 409 and waiting.json()["detail"]["code"] == "not_ready"
    assert server.get("/api/runs/nope/changes").status_code == 404
    activate(server, "b@b.example", "Beta", "beta")
    assert server.get("/api/runs/aug/changes").status_code == 404
