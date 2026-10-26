"""A stand-in for ``python -m pulse_flow.run`` in the worker's tests: same flags, same files.

It walks run_status.json through the eight stages and writes a small scores_current.csv, then
promotes like the real flow. ``FAKE_PIPELINE`` picks how it ends: ok (default), fail (a gate
fails, exit 1), crash (exit 2 with the status stuck at running), hang (never ends).
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
    status["status"] = "success"
    write()
    shutil.copytree(artifacts, args.artifacts_dir, dirs_exist_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
