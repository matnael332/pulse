// The data page: everything between signing up and the results, as one journey. The company's
// name, the wait for approval, then the upload (or the demo), the reading, the customer's review,
// the preparing and the model's run, each a step on the rail.
import { Loader } from "@mantine/core";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";

import { ApiError, getMyCompany, type MyCompany } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { ApprovalStep } from "../data/ApprovalStep";
import { CompanyStep } from "../data/CompanyStep";
import classes from "../data/Data.module.css";
import { IngestionStep } from "../data/IngestionStep";
import { LatestPanel } from "../data/LatestPanel";
import { Rail } from "../data/Rail";
import { RunStep } from "../data/RunStep";
import { Systems } from "../data/Systems";
import { UploadPanel } from "../data/UploadPanel";
import { useI18n } from "../i18n";
import { useSession } from "../session";

export type DataView = { kind: "start" } | { kind: "ingestion" | "run"; id: string };

/** Where a company in flight belongs: the step its upload or run is at. */
export function stepOf(current: NonNullable<MyCompany["current"]>): string {
  return current.kind === "run" ? `/data/runs/${current.id}` : `/data/ingestions/${current.id}`;
}

export function Data({ view }: { view: DataView }) {
  const { t, locale } = useI18n();
  const { me } = useSession();
  const [company, setCompany] = useState<MyCompany | null>(null);
  const [failed, setFailed] = useState<ApiError | null>(null);
  const active = me?.state === "active";

  useEffect(() => {
    if (!active) return;
    getMyCompany()
      .then(setCompany)
      .catch((error) => setFailed(error instanceof ApiError ? error : new ApiError(0, "")));
  }, [active, view.kind]);

  if (!me) return null;
  const name = me.company?.name;
  const latest = company?.latest_run;

  return (
    <div className={classes.page}>
      <header className={classes.head}>
        <div>
          <h1 className={`${classes.display} ${classes.title}`}>
            {name ? t("data.title", { name }) : t("welcome.title")}
          </h1>
          <p className={classes.lead}>{t("data.lead")}</p>
        </div>
        {latest?.finished_at && (
          <p className={classes.clock}>
            {t("home.latest")}
            <b>
              {new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(
                new Date(latest.finished_at),
              )}
            </b>
          </p>
        )}
      </header>
      {failed && <ErrorNotice problem={failed.problem} />}
      {me.state === "needs_company" && <CompanyStep />}
      {me.company && me.state !== "active" && me.state !== "needs_company" && (
        <ApprovalStep company={me.company} />
      )}
      {active && view.kind === "ingestion" && <IngestionStep id={view.id} company={company} />}
      {active && view.kind === "run" && <RunStep id={view.id} company={company} />}
      {active && view.kind === "start" && !company && !failed && <Loader mx="auto" mt="xl" />}
      {active && view.kind === "start" && company?.current && (
        <Navigate to={stepOf(company.current)} replace />
      )}
      {active && view.kind === "start" && company && !company.current && (
        <>
          <Rail at="upload" />
          <div className={`${classes.deck} ${classes.even}`}>
            <UploadPanel company={company} onCompany={setCompany} />
            <LatestPanel company={company} />
          </div>
          <Systems />
        </>
      )}
    </div>
  );
}
