"""The public demo: the product's own steps in one folder, without a server, a database, a language
model, pyarrow or a plotting library, as they run in a visitor's browser."""

import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from pulse_core import stages
from pulse_core.io import read_json
from pulse_demo import pack, runner, sample
from pulse_server import view
from pulse_server.worker import STAGES
from pulse_specs.workforce_saas.spec import make_spec

BACKEND = Path(__file__).resolve().parents[1]
ABSENT = (  # what Python in the browser does not have, or the demo does not ship
    "crewai",
    "fastapi",
    "flask",
    "google",
    "matplotlib",
    "pyarrow",
    "seaborn",
    "sqlalchemy",
    "starlette",
)
SCRIPT = """
import json, sys
from pathlib import Path

class Absent:
    def find_spec(self, name, path=None, target=None):
        if name.split(".")[0] in {absent!r}:
            raise ModuleNotFoundError(f"No module named {{name!r}}", name=name)

sys.meta_path.insert(0, Absent())
from pulse_demo.runner import Demo, call
root, export, out = map(Path, sys.argv[1:])
told = []
demo = Demo(root, lambda stage, facts: told.append([stage, facts]))
steps = {{}}
for method, args in [("propose", [str(export)]), ("approve", []), ("apply", []), ("run", [])]:
    steps[method] = json.loads(call(demo, method, json.dumps(args)))
out.write_text(json.dumps({{"told": told, **steps}}, ensure_ascii=False), encoding="utf-8")
"""


@pytest.fixture(scope="module")
def export(tmp_path_factory):
    return sample.build(tmp_path_factory.mktemp("sample"))


@pytest.fixture(scope="module")
def ran(tmp_path_factory, export):
    """The sample through the runner, in a process without what the browser lacks."""
    base = tmp_path_factory.mktemp("demo")
    out = base / "out.json"
    done = subprocess.run(
        [sys.executable, "-c", SCRIPT.format(absent=ABSENT), base / "c", export, out],
        env={**os.environ, "PYTHONPATH": str(BACKEND), "PYTHONUTF8": "1"},
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert done.returncode == 0, done.stderr[-3000:]
    return base / "c", json.loads(out.read_text(encoding="utf-8"))


def test_the_sample_is_small_and_says_what_it_is(export):
    assert export.stat().st_size < 3_000_000
    assert len(sample.NAMES) == len(set(sample.NAMES)) == sample.CONFIG.accounts


def test_the_sample_has_enough_history_and_accounts_at_risk(ran):
    _, told = ran
    report = told["apply"]["report"]
    assert report["cancellations"]["train"] >= 10 and report["cancellations"]["test"] >= 5
    assert not report["low_confidence"]
    assert report["groups_missing"] == list(sample.LEFT_OUT)
    assert told["run"]["summary"]["high"] >= 5 and told["run"]["summary"]["elevated"] >= 1


def test_the_review_shows_what_was_recognised_and_left_out(ran):
    _, told = ran
    shown = told["propose"]["review"]
    assert not shown["blocking"] and len(shown["tables"]) == 11
    assert [(c["table"], c["column"], c["reason"]) for c in shown["columns"]] == [
        ("punches", "punched_at", "uncertain")  # a date joined to a time
    ]
    left_out = {name for names in shown["ignored"].values() for name in names}
    assert {"שם עובד", "ת.ז.", "טלפון"} <= left_out


def test_every_step_says_what_it_did_in_numbers(ran):
    _, told = ran
    said = dict(told["told"])
    stages_told = [s for s, _ in told["told"] if s not in ("propose", "apply")]
    assert len(stages_told) == STAGES and stages_told[-1] == "promote_and_finish"
    assert said["propose"]["tables"] == 11 and said["propose"]["rows"] > 100_000
    assert said["propose"]["left_out"] >= 3
    assert said["apply"]["accounts"] == sample.CONFIG.accounts
    assert said["gate_contract"]["rows_in"] >= said["gate_contract"]["rows_out"] > 0
    assert said["run_modeling_phase"]["models"] == 3
    assert said["gate_artifacts"]["model"] == told["run"]["advanced"]["selected_model"]
    assert said["promote_and_finish"]["high"] == told["run"]["summary"]["high"]


def test_the_answers_are_the_servers_own_on_the_same_data(ran, tmp_path):
    """The pipeline as the server runs it (figures and all) on the data the runner prepared."""
    root, told = ran
    data = root / "data" / runner.INGESTION
    spec = make_spec(**read_json(data / "spec_params.json"))
    stages.run_analyst_stage(spec, data / "raw", data / "lookups", tmp_path)
    stages.run_feature_stage(spec, tmp_path)
    stages.run_modeling_stage(spec, tmp_path, seed=spec.seed)
    business = view.business(tmp_path, root / "entity_map.csv")
    revenue = business.pop("revenue")
    answer = told["run"]["results"]
    assert answer["summary"] == {**told["run"]["summary"], **revenue}
    assert {k: answer[k] for k in business} == business
    advanced = view.advanced(tmp_path)
    assert len(advanced["figures"]) == 7 and told["run"]["advanced"]["figures"] == []
    assert {**told["run"]["advanced"], "figures": advanced["figures"]} == advanced
    assert set(told["run"]["docs"]) == set(view.DOCS)
    assert told["run"]["results"]["accounts"][0]["name"] in sample.NAMES


def test_nothing_of_the_export_is_left_but_the_mapped_columns(ran):
    root, _ = ran
    assert not (root / "uploads" / runner.INGESTION).exists()
    assert not (root / "staging" / runner.INGESTION).exists()
    employees = (root / "data" / runner.INGESTION / "raw" / "employees.csv").read_text("utf-8")
    assert "עובד " not in employees and "שם עובד" not in employees


@pytest.mark.parametrize(
    ("files", "code"),
    [
        (None, "archive_not_zip"),
        ({"readme.md": "hello"}, "archive_no_readable_files"),
        ({"a.csv": "x,y\n1,2\n"}, "core_groups_missing"),
    ],
)
def test_an_export_that_does_not_fit_is_refused_with_the_servers_codes(tmp_path, files, code):
    path = tmp_path / "x.zip"
    if files is None:
        path.write_bytes(b"not a zip")
    else:
        with zipfile.ZipFile(path, "w") as archive:
            for name, text in files.items():
                archive.writestr(name, text)
    answer = runner.Demo(tmp_path / "c").propose(str(path))
    assert (answer["ok"], answer["code"]) == (False, code)
    if code == "core_groups_missing":
        assert answer["params"]["groups"] and answer["params"]["present"] == []


def test_a_fix_is_checked_as_the_server_checks_it(export, tmp_path):
    demo = runner.Demo(tmp_path / "c")
    demo.propose(str(export))
    key = {"table": "punches", "column": "punched_at"}
    fixed = demo.fix({"columns": [{**key, "source": "תאריך"}]})
    assert fixed["ok"] and fixed["review"]["columns"][0]["origin"] == "user"
    refused = demo.fix({"columns": [{"table": "accounts", "column": "region", "source": "x"}]})
    assert (refused["ok"], refused["code"]) == (False, "invalid_edit")
    missing = demo.fix({"columns": [{**key, "source": None}]})
    assert missing["params"]["reason"] == "required"
    assert demo.approve() == {"ok": True}


def test_the_bridge_calls_only_the_runners_own_methods(tmp_path):
    demo = runner.Demo(tmp_path / "c")
    with pytest.raises(ValueError, match="unknown method"):
        runner.call(demo, "__init__")


def test_the_python_it_ships_holds_what_the_runner_needs_and_no_more(tmp_path):
    target = tmp_path / "pulse.zip"
    pack.pack_python(target)
    names = set(zipfile.ZipFile(target).namelist())
    assert {"pulse_demo/runner.py", "pulse_server/view.py", "openpyxl/__init__.py"} <= names
    server = {n for n in names if n.startswith("pulse_server/")}
    assert server == {n for n in pack.MODULES if n.startswith("pulse_server/")}
    assert not any("__pycache__" in n or n.endswith((".env", ".key", ".db")) for n in names)
    again = tmp_path / "again.zip"
    pack.pack_python(again)
    assert again.read_bytes() == target.read_bytes()


def test_a_file_that_is_not_the_pinned_one_is_refused(tmp_path):
    (tmp_path / "pyodide.mjs").write_text("something else", encoding="utf-8")
    with pytest.raises(RuntimeError, match="not the pinned file"):
        pack._fetch("pyodide.mjs", pack.CORE["pyodide.mjs"], tmp_path)
    lock = {
        "packages": {
            "Numpy": {"depends": []},
            **{n: {"depends": ["numpy"]} for n in pack.PACKAGES if n != "numpy"},
        }
    }
    assert set(pack.needed(lock)) == set(pack.PACKAGES)
