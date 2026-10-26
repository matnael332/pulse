"""The worker: takes one job at a time from the queue and does it.

- ``propose``: stage the export and propose a mapping (a child process). A structure approved
  before goes straight on to ``apply``; otherwise the customer reviews it on the site.
- ``apply``: normalise, check, write the data folder (a child process); then a run is queued.
- ``run``: the pipeline (``python -m pulse_flow.run``, a child process), its progress copied from
  ``run_status.json`` into the run row every few seconds.

One job at a time on the whole server: a step holds a whole export in memory. Every failure ends
as a code for the company (``errors``) and the detail in the job row and the log.

    uv run pulse-server worker
"""

from __future__ import annotations

import csv
import json
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from sqlalchemy.orm import Session, sessionmaker

from pulse_core.paths import repo_root
from pulse_core.status import read_status
from pulse_ingest import session
from pulse_server import jobs, steps
from pulse_server.db import make_engine
from pulse_server.models import Company, Ingestion, Job, Run, utcnow
from pulse_server.settings import Settings
from pulse_specs.workforce_saas.ingest_contract import CONTRACT

log = logging.getLogger("pulse_server.worker")
STAGES = 8  # run_status.json's stages_done when a run is complete
HEARTBEAT_SECONDS = 10
DEMO_EXPORT = "demo/export-v1.zip"  # bump the version when the generator changes


def llm_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


class Worker:
    def __init__(
        self,
        settings: Settings,
        *,
        inline: bool = False,
        pipeline_module: str = "pulse_flow.run",
        sessions: sessionmaker | None = None,
    ) -> None:
        """``inline`` runs propose and apply in this process (tests); the pipeline always runs
        as a child process (``pipeline_module`` lets tests run a fake one)."""
        self.settings = settings
        self.inline = inline
        self.pipeline_module = pipeline_module
        self.sessions = sessions or sessionmaker(
            make_engine(settings.database_url), expire_on_commit=False
        )
        self.work_dir = settings.work_dir.resolve()
        self.stopping = False
        self.child: subprocess.Popen | None = None

    @property
    def demo_export(self) -> Path:
        return self.work_dir / DEMO_EXPORT

    # -------------------------------------------------------------------------------- the loop

    def run_forever(self) -> None:
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, self._stop)
        with self.sessions() as db:
            jobs.recover_stale(db, self.settings)
        self.ensure_demo_export()
        log.info("worker ready")
        while not self.stopping:
            if not self.run_once():
                with self.sessions() as db:
                    jobs.recover_stale(db, self.settings)
                time.sleep(self.settings.worker_poll_seconds)

    def _stop(self, *_args) -> None:
        self.stopping = True
        if self.child and self.child.poll() is None:
            self.child.terminate()

    def run_once(self) -> bool:
        """Do the next job, if any; False when the queue is empty."""
        with self.sessions() as db:
            job = jobs.claim(db)
            if job is None:
                return False
            log.info("job %s: %s", job.id, job.kind)
            handler = {"propose": self._propose, "apply": self._apply, "run": self._run}[job.kind]
            try:
                handler(db, job)
            except Exception as exc:  # noqa: BLE001 - whatever happens, the job ends failed
                log.exception("job %s failed", job.id)
                db.rollback()
                self._fail(db, job, "interrupted" if self.stopping else "internal", repr(exc))
            return True

    def _fail(self, db: Session, job: Job, code: str, detail: str, params: dict | None = None):
        if job.run_id:
            run = db.get(Run, job.run_id)
            if run.status in ("queued", "running"):
                jobs.fail_run(run, code, params)
        elif job.ingestion_id:
            ingestion = db.get(Ingestion, job.ingestion_id)
            if ingestion.status in jobs.IN_FLIGHT:
                jobs.fail_ingestion(db, self.settings, ingestion, code, params)
        jobs.finish(db, job, error=f"{code}: {detail}")

    def _folder(self, db: Session, ingestion: Ingestion):
        company = db.get(Company, ingestion.company_id)
        return jobs.customer_folder(self.settings, company, ingestion.demo)

    # -------------------------------------------------------------------------------- the steps

    def _step(self, db: Session, job: Job, kind: str, args: dict, timeout_minutes: int) -> dict:
        """A step's result: inline, or from a child process watched with heartbeats."""
        if self.inline:
            return steps.run_step(kind, args)
        folder = self.work_dir / "jobs"
        folder.mkdir(parents=True, exist_ok=True)
        result_path = folder / f"{job.id}.json"
        result_path.unlink(missing_ok=True)
        command = [sys.executable, "-m", "pulse_server.steps", kind, json.dumps(args)]
        code = self._watch(
            db,
            job,
            [*command, str(result_path)],
            folder / f"{job.id}.log",
            timeout_minutes,
            on_tick=None,
        )
        if code == "timeout":
            return {"ok": False, "code": "step_timeout", "params": {"minutes": timeout_minutes}}
        if code in (-9, 137):  # killed: most often out of memory
            return {"ok": False, "code": "out_of_memory", "params": {}}
        if not result_path.exists():
            return {"ok": False, "code": "internal", "params": {}, "detail": f"exit {code}"}
        return json.loads(result_path.read_text(encoding="utf-8"))

    def _watch(self, db, job, command, log_path, timeout_minutes, on_tick):
        """Run a child to its end, beating the job's heartbeat; its exit code or "timeout"."""
        deadline = time.monotonic() + timeout_minutes * 60
        last_beat = 0.0
        env = {**os.environ, "PYTHONHASHSEED": "0", "PYTHONUTF8": "1"}
        with open(log_path, "ab") as out:
            self.child = subprocess.Popen(
                command, cwd=repo_root(), env=env, stdout=out, stderr=subprocess.STDOUT
            )
            try:
                while True:
                    try:
                        return self.child.wait(timeout=self.settings.worker_poll_seconds)
                    except subprocess.TimeoutExpired:
                        pass
                    if on_tick:
                        on_tick()
                    if time.monotonic() - last_beat >= HEARTBEAT_SECONDS:
                        jobs.heartbeat(db, job)
                        last_beat = time.monotonic()
                    if time.monotonic() > deadline:
                        self.child.kill()
                        self.child.wait()
                        return "timeout"
            finally:
                self.child = None

    def _propose(self, db: Session, job: Job) -> None:
        ingestion = db.get(Ingestion, job.ingestion_id)
        folder = self._folder(db, ingestion)
        source = self.demo_export if ingestion.demo else folder.uploads(ingestion.id) / "export.zip"
        args = {
            "customer_dir": str(folder.root),
            "ingestion": ingestion.id,
            "zip": str(source),
            "use_llm": llm_available(),
        }
        result = self._step(db, job, "propose", args, self.settings.step_timeout_minutes)
        if not result["ok"]:
            return self._fail(db, job, result["code"], result.get("detail", ""), result["params"])
        ingestion.mapping_version = result["version"]
        ingestion.flags = result["flags"]
        if result["status"] == "approved":  # a structure approved before
            ingestion.status = "applying"
            ingestion.auto_approved = True
            ingestion.approved_at = utcnow()
            jobs.enqueue(db, "apply", ingestion.company_id, ingestion_id=ingestion.id)
        else:
            ingestion.status = "proposed"
        jobs.finish(db, job)

    def _apply(self, db: Session, job: Job) -> None:
        ingestion = db.get(Ingestion, job.ingestion_id)
        folder = self._folder(db, ingestion)
        args = {"customer_dir": str(folder.root), "ingestion": ingestion.id}
        result = self._step(db, job, "apply", args, self.settings.step_timeout_minutes)
        if not result["ok"]:
            return self._fail(db, job, result["code"], result.get("detail", ""), result["params"])
        ingestion.status = "applied"
        ingestion.report = result["report"]
        run = Run(
            id=session.new_ingestion_id(),
            company_id=ingestion.company_id,
            ingestion_id=ingestion.id,
            language=ingestion.language,
        )
        db.add(run)
        db.flush()
        jobs.enqueue(db, "run", ingestion.company_id, ingestion_id=ingestion.id, run_id=run.id)
        jobs.finish(db, job)

    def _run(self, db: Session, job: Job) -> None:
        run = db.get(Run, job.run_id)
        ingestion = run.ingestion
        folder = self._folder(db, ingestion)
        llm = llm_available()
        command = session.pipeline_command(
            folder.root,
            ingestion.id,
            CONTRACT,
            llm=llm,
            launcher=(sys.executable,),
            module=self.pipeline_module,
        )
        command += ["--run-id", run.id, "--language", run.language]
        if llm:
            command += ["--mode", "llm"]  # a PIPELINE_MODE in .env cannot override it
        run.status, run.mode, run.started_at = (
            "running",
            "llm" if llm else "deterministic",
            utcnow(),
        )
        db.commit()
        status_path = folder.runs / run.id / "run_status.json"

        def progress() -> None:
            status = read_status(status_path) or {}
            done = len(status.get("stages_done") or [])
            if status.get("stage") != run.stage or done != run.stages_done:
                run.stage, run.stages_done = status.get("stage"), done
                db.commit()

        log_dir = self.work_dir / "jobs"
        log_dir.mkdir(parents=True, exist_ok=True)
        code = self._watch(
            db,
            job,
            command,
            log_dir / f"{job.id}.log",
            self.settings.run_timeout_minutes,
            on_tick=progress,
        )
        progress()
        status = read_status(status_path) or {}
        if code == "timeout":
            jobs.fail_run(run, "run_timeout", {"minutes": self.settings.run_timeout_minutes})
            return jobs.finish(db, job, error="run_timeout")
        run.exit_code = code
        outcome = status.get("status")
        if code == 0 and outcome in ("success", "promotion_failed"):
            if outcome == "promotion_failed":
                log.warning("run %s: promotion failed; the run's own artifacts are used", run.id)
            run.status, run.finished_at = "succeeded", utcnow()
            run.stages_done = STAGES
            run.summary = summarise(folder.runs / run.id / "artifacts", ingestion.report or {})
            return jobs.finish(db, job)
        if code == 1:
            errors = " ".join(status.get("errors") or [])
            if "quota" in errors.lower():
                jobs.fail_run(run, "llm_quota", exit_code=code)
            else:
                jobs.fail_run(run, "pipeline_failed", {"stage": status.get("stage")}, code)
            return jobs.finish(db, job, error=errors or "pipeline_failed")
        if code in (-9, 137):
            jobs.fail_run(run, "out_of_memory", exit_code=code)
        else:
            jobs.fail_run(run, "pipeline_crashed", {"exit_code": code}, code)
        jobs.finish(db, job, error=f"pipeline exit {code}")

    # -------------------------------------------------------------------------------- the demo

    def ensure_demo_export(self) -> Path:
        """Build our scrambled synthetic export once per server (a minute or so)."""
        if not self.demo_export.exists():
            log.info("building the demo export")
            result = (
                steps.run_step("demo-export", {"out": str(self.demo_export)})
                if self.inline
                else self._build_demo_in_child()
            )
            if not result.get("ok"):
                log.error("the demo export could not be built: %s", result)
        return self.demo_export

    def _build_demo_in_child(self) -> dict:
        args = json.dumps({"out": str(self.demo_export)})
        result_path = self.demo_export.with_suffix(".json")
        self.demo_export.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [sys.executable, "-m", "pulse_server.steps", "demo-export", args, str(result_path)],
            cwd=repo_root(),
            check=False,
        )
        return json.loads(result_path.read_text()) if result_path.exists() else {"ok": False}


def summarise(artifacts: Path, report: dict) -> dict:
    """Accounts scored per risk level, and the snapshot date (for the home page and history)."""
    counts = {"high": 0, "elevated": 0, "normal": 0}
    path = artifacts / "scores_current.csv"
    if path.exists():
        with open(path, encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                counts[row["risk_level"]] = counts.get(row["risk_level"], 0) + 1
    return {
        "accounts": sum(counts.values()),
        **counts,
        "snapshot_date": report.get("snapshot_date"),
    }


def main(settings: Settings | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    Worker(settings or Settings()).run_forever()
