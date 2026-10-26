"""The worker's heavy steps, run in a child process (or inline in tests).

    python -m pulse_server.steps propose|apply|demo-export ARGS_JSON RESULT_JSON

A child process gives its memory back when it ends (pandas holds a whole export), and running out
of memory kills only the child. The result file is ``{"ok": true, ...}`` or ``{"ok": false,
"code": ..., "params": ...}`` for a refusal (exit 1); anything unexpected prints its traceback and
exits 2.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from pulse_ingest import review, session
from pulse_server.errors import StepFailed, refusal
from pulse_specs.workforce_saas.ingest_contract import CONTRACT

DEMO_ACCOUNTS = 80


def propose(args: dict) -> dict:
    """Stage the export and propose a mapping; the flags are what the customer may fix."""
    folder = Path(args["customer_dir"])
    ingestion, mapping = session.propose(
        Path(args["zip"]),
        folder,
        CONTRACT,
        use_llm=args.get("use_llm", False),
        ingestion=args["ingestion"],
    )
    present = CONTRACT.groups_present(list(mapping.tables))
    missing = [g for g in CONTRACT.core_groups if g not in present]
    if missing:  # nothing on the review screen can add a whole group of tables
        raise StepFailed("core_groups_missing", groups=missing, present=list(present))
    staged = review.Staged(folder / "staging" / ingestion)
    return {
        "status": mapping.status,
        "version": mapping.version,
        "flags": review.flags(staged.mapping, CONTRACT, staged.values),
    }


def apply(args: dict) -> dict:
    result = session.apply(Path(args["customer_dir"]), args["ingestion"], CONTRACT)
    return {"report": result.get("report", {}), "spec_params": result["spec_params"]}


def demo_export(args: dict) -> dict:
    """Our synthetic export, scrambled like a customer's (built once per server)."""
    import tempfile

    from pulse_specs.workforce_saas.scramble import scramble
    from pulse_specs.workforce_saas.synth import SynthConfig, write_dataset

    out = Path(args["out"])
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out.parent) as tmp:
        raw = write_dataset(Path(tmp) / "synth", SynthConfig(accounts=DEMO_ACCOUNTS))
        partial = scramble(raw, Path(tmp) / out.name, rows_per_sheet=30_000)
        partial.replace(out)
    return {"zip": str(out)}


STEPS = {"propose": propose, "apply": apply, "demo-export": demo_export}


def run_step(kind: str, args: dict) -> dict:
    """One step, its refusals turned into ``{"ok": false, "code", "params"}``."""
    try:
        return {"ok": True, **STEPS[kind](args)}
    except StepFailed as exc:
        return {"ok": False, "code": exc.code, "params": exc.params, "detail": str(exc)}
    except Exception as exc:
        code, params = refusal(exc)
        if code == "internal":
            raise
        return {"ok": False, "code": code, "params": params, "detail": str(exc)}


def main(argv: list[str] | None = None) -> int:
    kind, args_json, result_path = argv or sys.argv[1:]
    try:
        result = run_step(kind, json.loads(args_json))
    except Exception:
        traceback.print_exc()
        return 2
    Path(result_path).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
