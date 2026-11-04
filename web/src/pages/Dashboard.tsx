// The dashboard: a finished run's customers at risk, what is at stake and why (the overview), the
// accounts that changed since the previous month (?view=changes), and the model behind it
// (?view=model); on every tab, the copilot afloat in the corner when the language model is there.
// /dashboard opens the latest result, or the data page when there is none yet; a run that has not
// finished belongs to its step on the data page.
import { Loader } from "@mantine/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router";

import { ApiError, getMyCompany, getRun, listRuns, type Problem, type RunInfo } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import classes from "../dashboard/Dashboard.module.css";
import { day } from "../dashboard/deltas";
import { useI18n } from "../i18n";
import { useSession } from "../session";

const Overview = lazy(() => import("../dashboard/Overview"));
const ChangesView = lazy(() => import("../dashboard/ChangesView"));
const ModelView = lazy(() => import("../dashboard/ModelView"));
const FloatingCopilot = lazy(() =>
  import("../dashboard/Copilot").then((m) => ({ default: m.FloatingCopilot })),
);

export function Dashboard() {
  const { runId } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const { t, locale } = useI18n();
  const { me } = useSession();
  const [latest, setLatest] = useState<string | null>(null);
  const [run, setRun] = useState<RunInfo | null>(null);
  const [runs, setRuns] = useState<RunInfo[] | null>(null);
  const [problem, setProblem] = useState<Problem | null | undefined>(undefined);

  useEffect(() => {
    if (runId) {
      getRun(runId)
        .then(setRun)
        .catch((error) => setProblem(error instanceof ApiError ? error.problem : null));
      listRuns()
        .then((answer) => setRuns(answer.runs))
        .catch(() => setRuns([]));
    } else {
      getMyCompany()
        .then((company) => setLatest(company.latest_run ? company.latest_run.id : ""))
        .catch(() => setLatest(""));
    }
  }, [runId]);

  if (!runId) {
    if (latest === null) return <Loader mx="auto" mt="xl" />;
    return (
      <Navigate
        to={{ pathname: latest ? `/dashboard/${latest}` : "/data", search: location.search }}
        replace
      />
    );
  }
  if (problem !== undefined) return <ErrorNotice problem={problem} />;
  if (!run || !runs) return <Loader mx="auto" mt="xl" />;
  if (run.status !== "succeeded") return <Navigate to={`/data/runs/${run.id}`} replace />;

  const asked = params.get("view");
  const view = asked === "model" || asked === "changes" ? asked : "";
  const tab = (to: string) => ({
    to: { search: to ? `?view=${to}` : "" },
    className: classes.tab,
    "aria-current": view === to ? ("page" as const) : undefined,
  });
  const currency = me?.company?.currency ?? "ILS";
  const summary = run.summary;
  const snapshot = summary?.snapshot_date;
  const count = new Intl.NumberFormat(locale);

  return (
    <div className={classes.page}>
      <header className={classes.head}>
        <div>
          <h1 className={`${classes.display} ${classes.title}`}>
            {t("dashboard.title", { name: me?.company?.name ?? "" })}
          </h1>
          {summary && (
            <p className={classes.lead}>
              {summary.high
                ? t("dashboard.lead", {
                    high: count.format(summary.high),
                    accounts: count.format(summary.accounts),
                  })
                : t("dashboard.leadNone")}
            </p>
          )}
        </div>
        <div className={classes.stamp}>
          {run.demo && <span className={classes.tag}>{t("common.demo")}</span>}
          {snapshot && (
            <span>
              {t("run.snapshot", {
                date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                  day(snapshot),
                ),
              })}
            </span>
          )}
        </div>
      </header>
      <nav className={classes.tabs}>
        <Link {...tab("")}>{t("results.business")}</Link>
        <Link {...tab("changes")}>{t("results.changes")}</Link>
        <Link {...tab("model")}>{t("results.advanced")}</Link>
      </nav>
      <Suspense fallback={<Loader mx="auto" mt="xl" />}>
        {view === "model" ? (
          <ModelView runId={run.id} runs={runs} />
        ) : view === "changes" ? (
          <ChangesView run={run} currency={currency} />
        ) : (
          <Overview run={run} currency={currency} />
        )}
      </Suspense>
      {me?.llm && (
        <Suspense fallback={null}>
          <FloatingCopilot runId={run.id} />
        </Suspense>
      )}
    </div>
  );
}
