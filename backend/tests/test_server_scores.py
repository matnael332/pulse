"""Each scored account's monthly revenue, and the revenue at high risk."""

from pathlib import Path

import pytest

from pulse_server.scores import revenue, scored_mrr

SCORES = "account_id,account_month_id,month_end,probability,risk_level,rank\n"


def _write(folder: Path, scores: list[str], rows: str | None) -> Path:
    (folder / "scores_current.csv").write_text(SCORES + "\n".join(scores) + "\n", encoding="utf-8")
    if rows is not None:
        (folder / "score_rows.csv").write_text(rows, encoding="utf-8")
    return folder


def test_the_scored_month_is_matched_by_its_row_id(tmp_path):
    art = _write(
        tmp_path,
        ["a,a:2025-08,x,0.9,high,1", "b,b:2025-08,x,0.1,normal,2"],
        "account_month_id,mrr\na:2025-07,999\na:2025-08,10.6\nb:2025-08,\n",
    )
    assert scored_mrr(art) == {"a": 11, "b": None}


@pytest.mark.parametrize("rows", [None, "account_month_id,seats\na:2025-08,3\n"])
def test_no_scored_rows_or_no_revenue_column_is_no_revenue(tmp_path, rows):
    art = _write(tmp_path, ["a,a:2025-08,x,0.9,high,1"], rows)
    assert scored_mrr(art) == {}
    assert revenue({"a": "high"}, {}) == {"revenue_at_risk": None, "revenue_total": None}


@pytest.mark.parametrize("value", ["nan", "inf", "n/a"])
def test_a_value_that_is_not_a_number_is_blank(tmp_path, value):
    art = _write(
        tmp_path, ["a,a:2025-08,x,0.9,high,1"], f"account_month_id,mrr\na:2025-08,{value}\n"
    )
    assert scored_mrr(art) == {"a": None}


def test_the_sums():
    levels = {"a": "high", "b": "elevated", "c": "normal"}
    assert revenue(levels, {"a": 5, "b": 7, "c": 1}) == {"revenue_at_risk": 5, "revenue_total": 13}
    # No account at high risk is a real zero; a blank among those summed makes the sum unknown.
    assert revenue({"b": "elevated"}, {"b": 7})["revenue_at_risk"] == 0
    assert revenue(levels, {"a": None, "b": 7, "c": 1}) == {
        "revenue_at_risk": None,
        "revenue_total": None,
    }
    assert revenue(levels, {"a": 5, "b": None, "c": 1}) == {
        "revenue_at_risk": 5,
        "revenue_total": None,
    }
