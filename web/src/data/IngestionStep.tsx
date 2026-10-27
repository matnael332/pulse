// One upload on its way: being read, waiting for the customer's review, being prepared, or
// refused. Once prepared, the page moves on to the run.
import { Button, Group, Loader } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";

import {
  approveIngestion,
  discardIngestion,
  getIngestion,
  getReview,
  type Ingestion,
  type MyCompany,
  type Review,
} from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { MappingReview } from "../components/MappingReview";
import { useI18n } from "../i18n";
import { usePoll } from "../poll";
import classes from "./Data.module.css";
import { Rail, type RailStep } from "./Rail";
import { StepPanel } from "./StepPanel";

const WORKING = ["proposing", "applying"];
const STEP: Record<Ingestion["status"], RailStep> = {
  proposing: "read",
  proposed: "review",
  applying: "prepare",
  applied: "prepare",
  failed: "read",
  discarded: "review",
};

export function IngestionStep({ id, company }: { id: string; company: MyCompany | null }) {
  const { t } = useI18n();
  const {
    value: ingestion,
    setValue,
    reload,
  } = usePoll<Ingestion>(
    () => getIngestion(id),
    (i) => WORKING.includes(i.status),
    id,
  );
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    if (ingestion?.status === "proposed" && !review) void getReview(id).then(setReview);
  }, [id, ingestion?.status, review]);

  if (!ingestion) return <Loader mx="auto" mt="xl" />;
  if (ingestion.status === "applied" && ingestion.run_id) {
    return <Navigate to={`/data/runs/${ingestion.run_id}`} replace />;
  }
  const working = WORKING.includes(ingestion.status);
  const failed = ingestion.status === "failed";

  return (
    <>
      <Rail
        at={STEP[ingestion.status]}
        working={working}
        failed={failed}
        note={
          ingestion.queue_position > 0
            ? t("queue.waiting", { count: String(ingestion.queue_position) })
            : ingestion.filename
        }
      />
      {working && (
        <StepPanel company={company} labelledBy="working-title">
          <h2 id="working-title" className={`${classes.display} ${classes.panelTitle}`}>
            {ingestion.status === "proposing" ? t("steps.read") : t("steps.prepare")}
          </h2>
          <Group gap="md" wrap="nowrap" aria-live="polite">
            <Loader size="sm" />
            <p className={classes.panelLead}>
              {ingestion.status === "proposing" ? t("ingestion.reading") : t("ingestion.preparing")}
            </p>
          </Group>
        </StepPanel>
      )}
      {ingestion.status === "proposed" && review && (
        <MappingReview
          ingestionId={id}
          review={review}
          onChange={setReview}
          onApprove={async () => {
            setValue(await approveIngestion(id));
            reload();
          }}
          onDiscard={async () => setValue(await discardIngestion(id))}
        />
      )}
      {failed && (
        <StepPanel company={company} labelledBy="failed-title">
          <h2 id="failed-title" className={`${classes.display} ${classes.panelTitle}`}>
            {t("ingestion.failed")}
          </h2>
          <ErrorNotice problem={ingestion.error} />
          <Group mt="lg">
            <Button component={Link} to="/data">
              {t("ingestion.another")}
            </Button>
          </Group>
        </StepPanel>
      )}
      {ingestion.status === "discarded" && (
        <StepPanel company={company}>
          <p className={classes.panelLead}>{t("ingestion.discarded")}</p>
          <Button component={Link} to="/data">
            {t("common.back")}
          </Button>
        </StepPanel>
      )}
    </>
  );
}
