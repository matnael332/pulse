"""Ingestion: a scrambled export (Hebrew, Excel, monthly files, Israeli dates, extra personal
columns) goes in; the raw layer the pipeline reads comes out, and nothing else stays behind."""

import json
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from pulse_core.io import read_json
from pulse_core.raw import load_raw_tables
from pulse_core.stages import run_analyst_stage
from pulse_ingest import heuristics, llm, session
from pulse_ingest.contract import PreflightError
from pulse_ingest.layout import CustomerDir
from pulse_ingest.llm_payloads import mapping_payload
from pulse_ingest.normalize import MappingError
from pulse_ingest.profile import infer_kind, profile_tables
from pulse_ingest.sources import UnsafeArchive, ZipSource
from pulse_specs.workforce_saas import columns as wf
from pulse_specs.workforce_saas.ingest_contract import CONTRACT
from pulse_specs.workforce_saas.preflight import preflight
from pulse_specs.workforce_saas.scramble import scramble
from pulse_specs.workforce_saas.spec import SPEC, make_spec
from pulse_specs.workforce_saas.synth import SynthConfig, write_dataset
from tests.conftest import PERSONAL


def _ingest(zip_path: Path, customer: Path, **kwargs) -> tuple[str, dict]:
    ingestion, _ = session.propose(zip_path, customer, CONTRACT, use_llm=False, **kwargs)
    session.approve(customer, ingestion)
    return ingestion, session.apply(customer, ingestion, CONTRACT)


@pytest.fixture(scope="module")
def ingested(tmp_path_factory, scrambled_export):
    base = tmp_path_factory.mktemp("ingest")
    customer = base / "customer"
    ingestion, result = _ingest(scrambled_export.export, customer)
    return SimpleNamespace(
        base=base,
        raw=scrambled_export.raw,
        export=scrambled_export.export,
        customer=customer,
        ingestion=ingestion,
        result=result,
    )


# ----------------------------------------------------------------------------- the round trip


def test_the_scrambled_export_comes_back_as_the_same_clean_table(ingested):
    original = ingested.base / "original"
    run_analyst_stage(SPEC, ingested.raw, ingested.raw.parent / "lookups", original)
    data = ingested.result["data_dir"]
    spec = make_spec(**read_json(data / "spec_params.json"))
    again = ingested.base / "again"
    run_analyst_stage(spec, data / "raw", data / "lookups", again)
    assert (again / "clean_data.csv").read_bytes() == (original / "clean_data.csv").read_bytes()


def test_preflight_derives_the_spec_from_the_data(ingested):
    params = ingested.result["spec_params"]
    assert params["snapshot_date"] == SPEC.snapshot_date
    assert params["groups"] == list(wf.ALL_GROUPS) and params["test_months"] == 6
    assert not params["low_confidence"] and not params["synthetic"]
    assert params["allowed_values"]["plan"] == sorted(wf.PLANS)


def test_nothing_personal_or_original_stays_behind(ingested):
    customer = ingested.customer
    assert not any((customer / "uploads").iterdir()) and not any((customer / "staging").iterdir())
    employees = pd.read_excel(
        zipfile.ZipFile(ingested.export).open("export.xlsx"),
        sheet_name="עובדים",
        dtype=str,
    )
    secrets = set(employees["ת.ז."]) | set(employees["טלפון"]) | set(employees["שם עובד"])
    secrets |= set(employees["מספר עובד"])  # employee numbers are hashed, never stored as is
    for path in customer.rglob("*"):
        if path.is_file() and path.suffix in (".csv", ".json"):
            text = path.read_text(encoding="utf-8")
            leaked = [s for s in list(secrets)[:300] if s and s in text]
            assert not leaked, f"{path.name} holds {leaked[:3]}"


def test_accounts_get_stable_pseudonyms_and_keep_their_names(ingested):
    entity = pd.read_csv(ingested.customer / "entity_map.csv", dtype=str)
    assert entity["pseudo_id"].iloc[0] == "acc_000001" and entity["source_id"].iloc[0] == "10001"
    assert entity["name"].iloc[0] == "לקוח 10001"
    accounts = load_raw_tables(ingested.result["data_dir"] / "raw", ["accounts"])["accounts"]
    assert set(accounts["account_id"]) == set(entity["pseudo_id"])


def test_next_month_reuses_the_approved_mapping(ingested):
    ingestion, mapping = session.propose(
        ingested.export, ingested.customer, CONTRACT, use_llm=False
    )
    assert mapping.status == "approved" and mapping.version == 1
    assert "same structure" in mapping.review[0]
    before = pd.read_csv(ingested.customer / "entity_map.csv", dtype=str)
    approved = (ingested.customer / "mappings" / "v1.json").read_bytes()
    session.apply(ingested.customer, ingestion, CONTRACT)
    after = pd.read_csv(ingested.customer / "entity_map.csv", dtype=str)
    pd.testing.assert_frame_equal(before, after)
    # the same mapping is not written again (its review notes stay those of the approval)
    assert (ingested.customer / "mappings" / "v1.json").read_bytes() == approved
    assert not list(ingested.customer.glob("entity_map.csv.tmp"))


def test_a_new_spelling_sends_a_known_structure_back_to_review(ingested):
    mapping = session.latest_approved(ingested.customer)
    method = mapping.tables["punches"].columns["method"]
    source = mapping.tables["punches"].sources[0]
    known = set(mapping.value_maps["punches.method"])
    values = {source: {method.column: sorted(known | {"שעון חכם"})}}
    assert heuristics.unrecognised_values(mapping, CONTRACT, values) == {
        "punches.method": ["שעון חכם"]
    }
    values = {source: {method.column: sorted(known)}}
    assert heuristics.unrecognised_values(mapping, CONTRACT, values) == {}


def test_propose_takes_an_export_already_in_place_and_stages_the_values(ingested, tmp_path):
    customer = tmp_path / "c"
    upload = customer / "uploads" / "ing1"
    upload.mkdir(parents=True)
    in_place = upload / "export.zip"
    in_place.write_bytes(ingested.export.read_bytes())
    session.propose(in_place, customer, CONTRACT, use_llm=False, ingestion="ing1")
    assert [p.name for p in upload.iterdir()] == ["export.zip"]
    values = read_json(customer / "staging" / "ing1" / "values.json")
    mapping = read_json(customer / "staging" / "ing1" / "mapping.proposed.json")
    punches = mapping["tables"]["punches"]
    method = punches["columns"]["method"]["column"]
    assert values[punches["sources"][0]][method]  # the punch methods, as written
    assert all(0 < len(v) <= session.MAX_DISTINCT for t in values.values() for v in t.values())


def test_apply_refuses_a_mapping_that_is_not_approved(ingested, tmp_path):
    customer = tmp_path / "c"
    ingestion, mapping = session.propose(ingested.export, customer, CONTRACT, use_llm=False)
    assert mapping.status == "proposed"
    with pytest.raises(MappingError, match="not approved"):
        session.apply(customer, ingestion, CONTRACT)
    assert not (customer / "data").exists() and not (customer / "entity_map.csv").exists()
    assert (customer / "staging" / ingestion / "mapping.proposed.json").exists()


# ----------------------------------------------------------------------------- the mapping


def test_heuristics_alone_map_every_table_and_skip_personal_columns(ingested):
    staged = profile_tables(_source_tables(ingested.export, ingested.base / "unzipped"))
    mapping = heuristics.propose(staged, CONTRACT, "x")
    assert sorted(mapping.tables) == sorted(t.name for t in CONTRACT.tables)
    assert not heuristics.missing_required(mapping, CONTRACT)
    punch = mapping.tables["punches"].columns["punched_at"]
    assert (punch.column, punch.time_column) == ("תאריך", "שעה")
    employees = next(k for k in mapping.ignored if k.endswith("עובדים"))
    assert sorted(mapping.ignored[employees]) == sorted(PERSONAL)


def _strings(node) -> set[str]:
    if isinstance(node, dict):
        return set().union(*(_strings(v) for v in node.values())) if node else set()
    if isinstance(node, list):
        return set().union(*(_strings(v) for v in node)) if node else set()
    return {node} if isinstance(node, str) else set()


def test_the_llm_payload_holds_names_and_kinds_only(ingested):
    tables = _source_tables(ingested.export, ingested.base / "unzipped2")
    payload = mapping_payload(profile_tables(tables), CONTRACT)
    sent = _strings(payload)
    names = {str(c) for df in tables.values() for c in df.columns}
    names |= {t.name for t in CONTRACT.tables} | {
        c.name for t in CONTRACT.tables for c in t.columns
    }
    names |= {"string", "int", "float", "bool", "datetime", "date", "time"}
    values = {v for df in tables.values() for c in df.columns for v in df[c].unique() if v}
    leaked = sorted((values - names) & sent)
    assert not leaked, leaked[:5]
    assert json.dumps(payload, ensure_ascii=False).count("10001") == 0  # no customer id at all


def test_llm_pairs_merge_with_the_heuristic_ones(ingested):
    profile = profile_tables(_source_tables(ingested.export, ingested.base / "unzipped3"))
    mapping = heuristics.propose(profile, CONTRACT, "x")
    shifts = mapping.tables["shifts"]
    answer = llm.LlmMapping(
        tables=[
            llm.TablePair(
                target_table="shifts",
                source_table=shifts.sources[0],
                columns=[
                    llm.ColumnPair(target_column="outcome", source_column="Shift Status"),
                    llm.ColumnPair(target_column="planned_end", source_column="Published"),
                ],
            )
        ]
    )
    llm.merge(mapping, answer, profile, CONTRACT)
    assert shifts.columns["outcome"].origin == "both"
    # an exact heuristic match beats the LLM's guess and is not flagged
    assert shifts.columns["planned_end"].column == "Shift End"


class _FakeModels:
    def generate_content(self, **kwargs):
        raise RuntimeError("quota")


def test_an_llm_failure_leaves_the_heuristic_proposal(ingested, tmp_path):
    client = SimpleNamespace(models=_FakeModels())
    _ingestion, mapping = session.propose(
        ingested.export, tmp_path / "c", CONTRACT, use_llm=True, llm_client=client
    )
    assert any("LLM mapping unavailable" in r for r in mapping.review)
    assert sorted(mapping.tables) == sorted(t.name for t in CONTRACT.tables)


def _source_tables(zip_path: Path, staging: Path) -> dict[str, pd.DataFrame]:
    from pulse_ingest.profile import union_groups
    from pulse_ingest.readers import read_files

    files = ZipSource(zip_path).fetch(staging)
    tables, _ = read_files(files, staging / "files")
    return {
        name: pd.concat([tables[m] for m in members], ignore_index=True)
        for name, members in union_groups(tables).items()
    }


# ----------------------------------------------------------------------------- the preflight


def _typed(ingested) -> dict[str, pd.DataFrame]:
    return load_raw_tables(ingested.result["data_dir"] / "raw")


def test_a_missing_core_group_is_refused(ingested):
    tables = _typed(ingested)
    groups = tuple(g for g in wf.ALL_GROUPS if g != "payroll")
    with pytest.raises(PreflightError, match="core data groups missing") as refused:
        preflight(tables, groups)
    assert (refused.value.code, refused.value.params) == (
        "core_groups_missing",
        {"groups": ["payroll"]},
    )


def test_a_short_history_shrinks_the_test_window_then_refuses(ingested, monkeypatch):
    from pulse_specs.workforce_saas import preflight as pf

    monkeypatch.setattr(pf, "MIN_TRAIN_CANCELLATIONS", 1)
    monkeypatch.setattr(pf, "MIN_TEST_CANCELLATIONS", 1)
    tables = _typed(ingested)
    billing = tables["billing_monthly"]
    # billed from December 2024: a 6- or 5-month test window leaves no training months
    cut = {**tables, "billing_monthly": billing[billing["period"] >= "2024-12-01"]}
    report = preflight(cut, wf.ALL_GROUPS)
    assert report["spec_params"]["test_months"] == 4 and report["spec_params"]["low_confidence"]
    assert len(report["report"]["shorter_windows_tried"]) == 2
    cut = {**tables, "billing_monthly": billing[billing["period"] >= "2025-03-01"]}
    with pytest.raises(PreflightError, match="not enough history") as refused:
        preflight(cut, wf.ALL_GROUPS)
    assert refused.value.code == "not_enough_history"
    params = refused.value.params  # no window fits at all: no cancellations were counted
    assert params["need_train"] == 1 and params["cancellations"] is None and params["train_start"]


# ----------------------------------------------------------------------------- reading and safety


def test_kinds_and_israeli_formats_are_recognised():
    assert infer_kind(pd.Series(["31/01/2024 08:15:00", ""])) == ("datetime", "%d/%m/%Y %H:%M:%S")
    assert infer_kind(pd.Series(["31/01/2024", "01/02/2024"])) == ("date", "%d/%m/%Y")
    assert infer_kind(pd.Series(["08:15:00", "17:00:00"])) == ("time", "%H:%M:%S")
    assert infer_kind(pd.Series(["כן", "לא", ""])) == ("bool", None)
    assert infer_kind(pd.Series(["0", "1", "1"])) == ("int", None)
    assert infer_kind(pd.Series(["12.5", "3"])) == ("float", None)


def _zip(tmp_path: Path, entries: dict[str, bytes]) -> Path:
    path = tmp_path / "x.zip"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return path


@pytest.mark.parametrize(
    ("entries", "message", "code"),
    [
        ({"../evil.csv": b"a\n1\n"}, "outside the archive", "archive_unsafe_path"),
        ({"inner.zip": b"PK"}, "archive inside", "archive_nested"),
        ({"bomb.csv": b"0" * 50_000_000}, "ratio", "archive_ratio"),
        ({"readme.pdf": b"x"}, "no readable files", "archive_no_readable_files"),
    ],
)
def test_unsafe_archives_are_refused(tmp_path, entries, message, code):
    with pytest.raises(UnsafeArchive, match=message) as refused:
        ZipSource(_zip(tmp_path, entries)).fetch(tmp_path / "staging")
    assert refused.value.code == code


def test_hebrew_windows_encoding_is_read(tmp_path):
    text = "מספר לקוח,סוג היעדרות\n10001,מחלה\n".encode("cp1255")
    path = _zip(tmp_path, {"היעדרויות.csv": text})
    tables = _source_tables(path, tmp_path / "s")
    df = next(iter(tables.values()))
    assert list(df.columns) == ["מספר לקוח", "סוג היעדרות"] and df.iloc[0, 1] == "מחלה"


def test_a_dirty_export_without_optional_groups_runs_end_to_end(tmp_path):
    from pulse_flow.run import main

    raw = write_dataset(tmp_path / "synth", SynthConfig(accounts=80))  # with the planted dirt
    export = scramble(raw, tmp_path / "export.zip", drop_groups=("shifts", "money"))
    ingestion, result = _ingest(export, tmp_path / "customer")
    data = result["data_dir"]
    params = result["spec_params"]
    assert "shifts" not in params["groups"] and "money" not in params["groups"]
    assert "shifts.csv" not in read_json(data / "raw" / "manifest.json")["files"]
    command = session.pipeline_command(tmp_path / "customer", ingestion, CONTRACT)
    assert command[:3] == ["uv", "run", "python"] and "--no-llm" in command
    code = main([*command[5:], "--run-id", "dirty"])  # after `uv run python -m pulse_flow.run`
    assert code == 0
    artifacts = tmp_path / "customer" / "artifacts"
    contract = read_json(artifacts / "dataset_contract.json")
    assert contract["data_groups"]["missing"] == ["shifts", "money"]
    assert (artifacts / "scores_current.csv").exists()
    assert (tmp_path / "customer" / "runs" / "dirty" / "run_status.json").exists()


def test_the_pipeline_command_follows_the_customer_layout(tmp_path):
    command = session.pipeline_command(
        tmp_path, "ing1", CONTRACT, llm=True, launcher=("/venv/bin/python",)
    )
    assert command[:3] == ["/venv/bin/python", "-m", "pulse_flow.run"]
    assert "--no-llm" not in command
    flags = dict(zip(command[3::2], command[4::2], strict=True))
    assert flags == {
        "--spec": CONTRACT.spec_ref,
        "--spec-params": str(tmp_path / "data" / "ing1" / "spec_params.json"),
        "--data-dir": str(tmp_path / "data" / "ing1"),
        "--runs-dir": str(tmp_path / "runs"),
        "--artifacts-dir": str(tmp_path / "artifacts"),
    }


def test_a_new_customer_folder_is_created_once(tmp_path):
    layout = CustomerDir(tmp_path / "acme").create().create()
    assert all(p.is_dir() for p in (layout.root / "data", layout.runs, layout.artifacts))
