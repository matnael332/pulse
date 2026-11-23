"""One visitor's export through the product's own steps, in one folder, without a server.

The same functions as the server's worker: ``pulse_server.steps`` to recognise and to prepare the
export, ``pulse_ingest.review`` for the customer's fixes, ``pulse_core.stages`` with the pipeline's
three gates, and ``pulse_server.view`` for what the screens show. No language model is asked and
nothing is drawn. Each step says what it did in numbers (``report(stage, facts)``): the demo shows
them while it works.

``call`` is the bridge to the page: a method's name and its arguments as JSON, the answer as JSON.
A refusal is ``{"ok": false, "code", "params"}`` with the same codes the server answers with, which
the site already words in Hebrew and English.
"""

from __future__ import annotations

import json
import shutil
import zipfile
from collections.abc import Callable
from pathlib import Path

from pulse_core import stages
from pulse_core.modeling.candidates import CANDIDATE_DESCRIPTIONS
from pulse_core.raw import check_raw_schema, verify_manifest
from pulse_core.validate import (
    validate_artifacts,
    validate_clean_data_against_contract,
    validate_features,
)
from pulse_ingest import review, session
from pulse_ingest.layout import CustomerDir
from pulse_server import steps, view
from pulse_specs.workforce_saas.ingest_contract import CONTRACT
from pulse_specs.workforce_saas.spec import make_spec

INGESTION = "demo"
Report = Callable[[str, dict], None]


class GateStopped(Exception):
    def __init__(self, stage: str, errors: list[str]) -> None:
        super().__init__("; ".join(errors) or stage)
        self.stage = stage


def _quiet(stage: str, facts: dict) -> None:
    pass


class Demo:
    def __init__(self, root: str | Path, report: Report = _quiet) -> None:
        self.folder = CustomerDir(Path(root))
        self.report = report
        self.flags: dict = {"columns": [], "values": {}}
        self.prepared: dict = {}

    # ------------------------------------------------------------------------ the export
    def propose(self, zip_path: str) -> dict:
        """Read the export and propose a mapping; the review, or why it was refused."""
        shutil.rmtree(self.folder.root, ignore_errors=True)
        self.folder.create()
        answer = steps.run_step(
            "propose",
            {"customer_dir": str(self.folder.root), "zip": zip_path, "ingestion": INGESTION},
        )
        if not answer["ok"]:
            return answer
        self.flags = answer["flags"]
        shown = self.review()
        self.report(
            "propose",
            {
                "files": _files(Path(zip_path)),
                "rows": sum(t["rows"] for t in shown["tables"]),
                "tables": len(shown["tables"]),
                "groups": len(shown["groups"]["present"]),
                "left_out": sum(len(columns) for columns in shown["ignored"].values()),
            },
        )
        return {"ok": True, "version": answer["version"], "review": shown}

    def _staged(self) -> review.Staged:
        return review.Staged(self.folder.staging(INGESTION))

    def review(self) -> dict:
        return review.view(self._staged(), CONTRACT, self.flags)

    def fix(self, fixes: dict) -> dict:
        """The customer's fixes (as the server takes them); the review after them."""
        try:
            self.flags = review.edit(
                self._staged(),
                CONTRACT,
                self.flags,
                columns=fixes.get("columns") or [],
                values=fixes.get("values") or [],
            )
        except review.InvalidEdit as exc:
            return {"ok": False, "code": exc.code, "params": exc.params}
        return {"ok": True, "review": self.review()}

    def approve(self) -> dict:
        missing = review.blocking(self._staged().mapping, CONTRACT)
        if missing:
            return {"ok": False, "code": "mapping_incomplete", "params": {"columns": missing}}
        session.approve(self.folder.root, INGESTION)
        return {"ok": True}

    def apply(self) -> dict:
        """Prepare the approved export: pseudonyms, types, and whether there is enough history."""
        answer = steps.run_step(
            "apply", {"customer_dir": str(self.folder.root), "ingestion": INGESTION}
        )
        if answer["ok"]:
            self.prepared = answer
            report = answer["report"]
            self.report(
                "apply",
                {
                    "accounts": report.get("accounts"),
                    "train": (report.get("cancellations") or {}).get("train"),
                    "test": (report.get("cancellations") or {}).get("test"),
                },
            )
        return answer

    # ------------------------------------------------------------------------ the run
    def run(self) -> dict:
        """The pipeline's stages and gates, then everything the screens ask for."""
        try:
            self._stages()
        except GateStopped as exc:
            return {"ok": False, "code": "pipeline_failed", "params": {"stage": exc.stage}}
        art = self.folder.artifacts
        report = self.prepared["report"]
        business = view.business(art, self.folder.entity_map)
        summary = {**view.summarise(art, report), **business.pop("revenue")}
        self.report("promote_and_finish", {k: summary[k] for k in ("accounts", "high", "elevated")})
        return {
            "ok": True,
            "summary": summary,
            "results": {"summary": summary, **business, "data": view.data_notes(report)},
            "advanced": view.advanced(art),
            "docs": {
                name: (art / file).read_text(encoding="utf-8")
                for name, file in view.DOCS.items()
                if (art / file).exists()
            },
        }

    def _stages(self) -> None:
        data, art = self.folder.data(INGESTION), self.folder.artifacts
        spec = make_spec(**self.prepared["spec_params"])
        raw = data / "raw"
        self.report("check_inputs", {})
        verify_manifest(raw)
        schema = check_raw_schema(raw, required_tables=spec.required_tables)
        if not schema.passed:
            raise GateStopped("check_inputs", schema.errors)
        self.report("run_analyst_stage", {})
        cleaned = stages.run_analyst_stage(spec, raw, data / "lookups", art, figures=False)
        self._gate(
            "gate_contract",
            validate_clean_data_against_contract(
                art / "clean_data.csv", art / "dataset_contract.json"
            ),
            {"rows_in": cleaned["rows_in"], "rows_out": cleaned["rows_out"]},
        )
        self.report("run_feature_phase", {})
        built = stages.run_feature_stage(spec, art)
        self._gate(
            "gate_required_features",
            validate_features(
                art / "features.csv", art / "feature_spec.json", art / "dataset_contract.json"
            ),
            {"features": built["features"]},
        )
        self.report("run_modeling_phase", {"models": len(CANDIDATE_DESCRIPTIONS)})
        trained = stages.run_modeling_stage(spec, art, seed=spec.seed, figures=False)
        self._gate("gate_artifacts", validate_artifacts(art), {"model": trained["selected_model"]})

    def _gate(self, stage: str, checked, facts: dict) -> None:
        self.report(stage, facts)
        if not checked.passed:
            raise GateStopped(stage, checked.errors)


def _files(zip_path: Path) -> int:
    with zipfile.ZipFile(zip_path) as archive:
        return sum(1 for item in archive.infolist() if not item.is_dir())


def call(demo: Demo, method: str, args_json: str = "[]") -> str:
    """The page's bridge: one public method of ``demo``, JSON in and JSON out."""
    if method not in ("propose", "review", "fix", "approve", "apply", "run"):
        raise ValueError(f"unknown method {method!r}")
    answer = getattr(demo, method)(*json.loads(args_json))
    return json.dumps(answer, ensure_ascii=False, allow_nan=False)


def precompute(zip_path: Path, root: Path) -> dict:
    """The whole path with nothing to fix, as one answer (the sample's results, for a phone)."""
    demo = Demo(root)
    proposed = demo.propose(str(zip_path))
    if not (proposed["ok"] and demo.approve()["ok"] and demo.apply()["ok"]):
        raise RuntimeError(f"the sample was refused: {proposed}")
    answer = demo.run()
    if not answer["ok"]:
        raise RuntimeError(f"the sample's run stopped: {answer}")
    return {"review": proposed["review"], "report": demo.prepared["report"], **answer}
