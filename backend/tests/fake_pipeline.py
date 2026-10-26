"""A stand-in for ``python -m pulse_flow.run`` in the worker's tests: same flags, same files.

It walks run_status.json through the eight stages and writes small artifacts shaped like the
real ones (scores, reasons, narratives, metrics, reports, a figure, and decoys the site must never
serve), then promotes like the real flow. ``FAKE_PIPELINE`` picks how it ends: ok (default),
fail (a gate fails, exit 1), crash (exit 2 with the status stuck at running), hang (never ends).
"""

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

STAGES = [
    "check_inputs",
    "run_analyst_stage",
    "gate_contract",
    "run_feature_phase",
    "gate_required_features",
    "run_modeling_phase",
    "gate_artifacts",
    "promote_and_finish",
]
SCORES = [
    ("acc_000001", "high"),
    ("acc_000002", "high"),
    ("acc_000003", "elevated"),
    ("acc_000004", "normal"),
    ("acc_000005", "normal"),
]
MRR = {  # monthly revenue in the scored month: 2000 at high risk, 3000 in all (rounded)
    "acc_000001": 1200.4,
    "acc_000002": 799.6,
    "acc_000003": 500,
    "acc_000004": 300,
    "acc_000005": 199.5,
}


PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


def write_artifacts(artifacts: Path) -> None:
    def dump(name: str, value) -> None:
        (artifacts / name).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    reason = {"code": "payroll_exports", "feature": "payroll_exported_delta_1m"}
    dump(
        "reasons.json",
        {
            "entity_column": "account_id",
            "entities": [
                {
                    "account_id": account,
                    "rank": rank,
                    "reasons": [{**reason, "value": -1.0, "typical": 0.0, "contribution": 0.2}]
                    if level != "normal"
                    else [],
                }
                for rank, (account, level) in enumerate(SCORES, start=1)
            ],
        },
    )
    dump(
        "narratives.json",
        {
            "insights": {
                "source": "template",
                "language": "en",
                "headline": "Five accounts, two at high risk.",
                "key_findings": [
                    {"title": "Payroll", "evidence": "2 stopped", "business_meaning": "x"}
                ],
                "recommendations": ["Call them"],
                "data_caveats": [],
            }
        },
    )
    dump(
        "eda_summary.json",
        {
            "key_numbers": [{"label": "accounts", "value": 5}],
            "monthly_positive_rate": {
                "2025-01": {"positive_rate": 0.1, "rows": 5},
                "2025-02": {"positive_rate": 0.2, "rows": 5},
            },
        },
    )
    dump(
        "dataset_contract.json",
        {"data_groups": {"present": ["commercial"], "missing": ["shifts"], "core": []}},
    )
    test = {"roc_auc": 0.8, "pr_auc": 0.4, "precision_at_top10pct": 0.5, "brier": 0.07}
    dump(
        "metrics.json",
        {
            "selected_model": "logistic_regression",
            "selection": {"rule": "highest CV PR-AUC"},
            "split": {"test": {"dates": ["2025-01-01", "2025-06-30"], "rows": 50}},
            "candidates": {
                "logistic_regression": {"description": "LR", "test": test, "cv": {"folds": []}}
            },
            "permutation_importance": {
                "features": [{"feature": "payroll_exported_delta_1m", "importance_mean": 0.06}]
            },
        },
    )
    dump("model_meta.json", {"threshold": 0.33, "model_name": "logistic_regression"})
    dump(
        "feature_spec.json",
        {"features": [{"name": "payroll_exported_delta_1m", "description": "payroll change"}]},
    )
    for name, text in (
        ("model_card.md", "# Model card\n\n| a | b |\n|---|---|\n| 1 | 2 |\n"),
        ("evaluation_report.md", "# Evaluation\n"),
        ("cleaning_report.md", "# Cleaning\n"),
        ("clean_data.csv", "never,served\n"),
    ):
        (artifacts / name).write_text(text, encoding="utf-8")
    (artifacts / "figures").mkdir()
    (artifacts / "figures" / "roc_curves.png").write_bytes(PNG)
    (artifacts / "model.joblib").write_bytes(b"never served")


def main() -> int:
    parser = argparse.ArgumentParser()
    for flag in ("--runs-dir", "--artifacts-dir", "--run-id", "--language", "--data-dir"):
        parser.add_argument(flag)
    args, _ = parser.parse_known_args()
    mode = os.getenv("FAKE_PIPELINE", "ok")
    run = Path(args.runs_dir) / args.run_id
    run.mkdir(parents=True)
    status = {"run_id": args.run_id, "status": "running", "stage": "prepare_run", "stages_done": []}

    def write() -> None:
        (run / "run_status.json").write_text(json.dumps(status), encoding="utf-8")

    write()
    if mode == "crash":
        return 2
    if mode == "hang":
        time.sleep(3600)
    for stage in STAGES[:2] if mode == "fail" else STAGES:
        status["stage"] = stage
        write()
        time.sleep(0.02)
        status["stages_done"].append(stage)
        write()
    if mode == "fail":
        status.update(status="failed", stage="gate_contract", errors=["gate_contract: C01 failed"])
        write()
        return 1
    artifacts = run / "artifacts"
    artifacts.mkdir()
    lines = ["account_id,account_month_id,month_end,probability,risk_level,rank"]
    for rank, (account, level) in enumerate(SCORES, start=1):
        lines.append(f"{account},{account}:2025-08,2025-08-31 23:59:59,0.{9 - rank},{level},{rank}")
    (artifacts / "scores_current.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    # The rows that were scored: each account's revenue in the scored month, and an older month
    # that must not be counted.
    rows = ["account_month_id,account_id,month,seats,mrr", "acc_000001:2025-07,acc_000001,7,9,9999"]
    for account, _level in SCORES:
        rows.append(f"{account}:2025-08,{account},8,9,{MRR[account]}")
    (artifacts / "score_rows.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    write_artifacts(artifacts)
    status["status"] = "success"
    write()
    shutil.copytree(artifacts, args.artifacts_dir, dirs_exist_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
