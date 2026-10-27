// A run of the model: its progress through the pipeline's stages; on success, on to the
// dashboard; on failure, why, and another try.
import { Button, Group, Loader, Progress } from "@mantine/core";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import { ApiError, getRun, retryRun, type MyCompany, type Problem, type RunInfo } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { usePoll } from "../poll";
import classes from "./Data.module.css";
import { Rail } from "./Rail";
import { StepPanel } from "./StepPanel";

export function RunStep({ id, company }: { id: string; company: MyCompany | null }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { value: run } = usePoll<RunInfo>(
    () => getRun(id),
    (r) => r.status === "queued" || r.status === "running",
    id,
  );
  const [problem, setProblem] = useState<Problem | null>(null);

  async function retry() {
    try {
      const again = await retryRun(id);
      navigate(`/data/runs/${again.id}`);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.problem : null);
    }
  }

  if (!run) return <Loader mx="auto" mt="xl" />;
  if (run.status === "succeeded") return <Navigate to={`/dashboard/${run.id}`} replace />;
  const working = run.status === "queued" || run.status === "running";
  const stage = t("run.stage", {
    done: String(Math.min(run.stages_done + 1, run.stages)),
    total: String(run.stages),
    stage: label.stage(run.stage ?? "prepare_run", lang),
  });

  return (
    <>
      <Rail
        at="model"
        working={working}
        failed={run.status === "failed"}
        note={
          run.queue_position > 0
            ? t("queue.waiting", { count: String(run.queue_position) })
            : undefined
        }
      />
      {working && (
        <StepPanel company={company} labelledBy="run-title">
          <h2 id="run-title" className={`${classes.display} ${classes.panelTitle}`}>
            {t("run.title")}
          </h2>
          <p className={classes.panelLead} aria-live="polite">
            {stage}
          </p>
          <Progress value={(run.stages_done / run.stages) * 100} size="lg" radius="xl" animated />
        </StepPanel>
      )}
      {run.status === "failed" && (
        <StepPanel company={company} labelledBy="run-failed">
          <h2 id="run-failed" className={`${classes.display} ${classes.panelTitle}`}>
            {t("run.failed")}
          </h2>
          <ErrorNotice problem={run.error} />
          {problem && <ErrorNotice problem={problem} />}
          <Group mt="lg">
            <Button onClick={() => void retry()}>{t("common.retry")}</Button>
            <Button component={Link} to="/data" variant="default">
              {t("common.back")}
            </Button>
          </Group>
        </StepPanel>
      )}
    </>
  );
}
