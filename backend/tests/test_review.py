"""The customer's review of a proposed mapping: what they see, and the only fixes they may make."""

import shutil

import pytest

from pulse_core.io import read_json
from pulse_ingest import review, session
from pulse_ingest.review import InvalidEdit, Staged
from pulse_specs.workforce_saas.ingest_contract import CONTRACT
from tests.conftest import PERSONAL


@pytest.fixture(scope="module")
def proposed(tmp_path_factory, scrambled_export):
    customer = tmp_path_factory.mktemp("review") / "customer"
    ingestion, _ = session.propose(scrambled_export.export, customer, CONTRACT, use_llm=False)
    return customer / "staging" / ingestion


@pytest.fixture()
def staged(proposed, tmp_path) -> Staged:
    copy = tmp_path / "staging"
    shutil.copytree(proposed, copy)
    return Staged(copy)


def test_the_proposal_flags_the_uncertain_columns(staged):
    stored = review.flags(staged.mapping, CONTRACT, staged.values)
    flagged = {(c["table"], c["column"]): c["reason"] for c in stored["columns"]}
    assert flagged[("punches", "punched_at")] == "uncertain"  # a date joined to a time
    assert all(staged.mapping.tables[t].columns[c].confidence < 1 for t, c in flagged)


def test_the_review_shows_tables_groups_and_the_columns_left_out(staged):
    stored = review.flags(staged.mapping, CONTRACT, staged.values)
    shown = review.view(staged, CONTRACT, stored)
    assert len(shown["tables"]) == len(CONTRACT.tables) and not shown["groups"]["missing"]
    assert all(t["rows"] > 0 and t["mapped"] <= t["total"] for t in shown["tables"])
    left_out = {c for columns in shown["ignored"].values() for c in columns}
    assert set(PERSONAL) <= left_out
    punch = next(c for c in shown["columns"] if c["column"] == "punched_at")
    assert punch["current"] and punch["time_column"]
    assert {o["kind"] for o in punch["options"]} <= {"datetime", "date"}
    assert not shown["blocking"]


def test_a_flagged_column_can_be_fixed_and_is_saved(staged):
    stored = review.flags(staged.mapping, CONTRACT, staged.values)
    punch = next(c for c in review.view(staged, CONTRACT, stored)["columns"])
    taken = {
        c.column
        for name, c in staged.mapping.tables[punch["table"]].columns.items()
        if name != punch["column"]
    }
    choice = next(o["name"] for o in punch["options"] if o["name"] not in taken)
    after = review.edit(
        staged,
        CONTRACT,
        stored,
        columns=[{"table": punch["table"], "column": punch["column"], "source": choice}],
    )
    assert after["columns"] == stored["columns"]  # still flagged: it can be changed again
    saved = read_json(staged.staging / "mapping.proposed.json")
    fixed = saved["tables"][punch["table"]]["columns"][punch["column"]]
    assert (fixed["column"], fixed["origin"], fixed["confidence"]) == (choice, "user", 1.0)


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        ({"table": "accounts", "column": "account_id", "source": "x"}, "not_flagged"),
        ({"table": "punches", "column": "punched_at", "source": "no such column"}, "option"),
        ({"table": "punches", "column": "punched_at", "source": None}, "required"),
    ],
)
def test_only_flagged_columns_and_real_options_can_change(staged, change, reason):
    stored = review.flags(staged.mapping, CONTRACT, staged.values)
    before = (staged.staging / "mapping.proposed.json").read_bytes()
    with pytest.raises(InvalidEdit) as refused:
        review.edit(staged, CONTRACT, stored, columns=[change])
    assert refused.value.code == "invalid_edit" and refused.value.params == {"reason": reason}
    assert (staged.staging / "mapping.proposed.json").read_bytes() == before


def test_a_source_already_used_in_the_table_is_refused(staged):
    stored = review.flags(staged.mapping, CONTRACT, staged.values)
    used = staged.mapping.tables["punches"].columns["employee_id"].column
    change = {"table": "punches", "column": "punched_at", "source": used}
    with pytest.raises(InvalidEdit) as refused:
        review.edit(staged, CONTRACT, stored, columns=[change])
    assert refused.value.params["reason"] in ("taken", "option")


def test_an_unrecognised_spelling_gets_one_of_our_values(staged):
    method = staged.mapping.tables["punches"].columns["method"].column
    source = staged.mapping.tables["punches"].sources[0]
    staged.values[source][method] = [*staged.values[source][method], "שעון חכם"]
    stored = review.flags(staged.mapping, CONTRACT, staged.values)
    assert stored["values"] == {"punches.method": ["שעון חכם"]}
    shown = review.view(staged, CONTRACT, stored)["values"][0]
    assert shown["spellings"] == [{"spelling": "שעון חכם", "value": None}]
    assert "app" in shown["allowed"]
    fix = {"table": "punches", "column": "method", "spelling": "שעון חכם", "value": "app"}
    review.edit(staged, CONTRACT, stored, values=[fix])
    assert staged.mapping.value_maps["punches.method"]["שעון חכם"] == "app"
    with pytest.raises(InvalidEdit):
        review.edit(staged, CONTRACT, stored, values=[{**fix, "value": "teleport"}])
    with pytest.raises(InvalidEdit):
        review.edit(staged, CONTRACT, stored, values=[{**fix, "spelling": "אפליקציה"}])


def test_a_required_column_without_a_source_blocks_the_approval(staged):
    staged.mapping.tables["punches"].columns.pop("punched_at")
    stored = review.flags(staged.mapping, CONTRACT, staged.values)
    assert {"table": "punches", "column": "punched_at", "reason": "missing"} in stored["columns"]
    assert review.blocking(staged.mapping, CONTRACT) == [
        {"table": "punches", "column": "punched_at"}
    ]
