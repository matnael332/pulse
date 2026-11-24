// The dashboard's overview of one run: what is at stake (the company's accounts as a sky, the
// revenue at risk and the counts), what changed since the previous month, who is at risk, why, and
// the trend. Its own bundle, with the charts.
import "@mantine/charts/styles.css";

import { Loader } from "@mantine/core";
import { useEffect, useState } from "react";

import {
  ApiError,
  getResults,
  type Currency,
  type Problem,
  type Results,
  type RunInfo,
} from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { useI18n } from "../i18n";
import { band, beside, Orbit } from "../landing/Orbit";
import type { Geometry } from "../landing/sky";
import { Slot } from "../slots";
import { AtRiskTable } from "./AtRiskTable";
import { ChangesPanel, useChanges } from "./ChangesView";
import { RiskHistogram, TrendChart } from "./Charts";
import classes from "./Dashboard.module.css";
import { Counts, type Facts, Revenue } from "./Kpis";
import { latestRate } from "./figures";
import { useNamed } from "./named";
import { DataNotes, Findings, TopReasons } from "./Words";

/** The sky across the panel, the planet on the far side from the figure; on a phone, above it. */
function wide(width: number, height: number, rtl: boolean): Geometry {
  if (width < 700) return band(width, height);
  return {
    cx: width * (rtl ? 0.26 : 0.74),
    cy: height * 0.5,
    radius: Math.min(height * 0.62, width * 0.17),
    spots: beside(rtl),
  };
}

/** What is at stake: the company's accounts as a sky, the ones most likely to leave named, the
 * revenue at risk and the counts. */
function Hero({ results, facts }: { results: Results; facts: Facts }) {
  const { lang } = useI18n();
  const named = useNamed(results.accounts, facts.currency);
  return (
    <section className={`${classes.panel} ${classes.hero}`}>
      <div className={classes.heroSky}>
        <Orbit
          key={results.run.id}
          className={classes.sky}
          rtl={lang === "he"}
          layout={wide}
          result={{ accounts: facts.summary.accounts, risk: facts.summary.high }}
          named={named}
        />
        <dl className={`${classes.over} ${classes.answerBox}`}>
          <Revenue facts={facts} />
        </dl>
      </div>
      <dl className={classes.strip}>
        <Counts facts={facts} />
      </dl>
    </section>
  );
}

export default function Overview({ run, currency }: { run: RunInfo; currency: Currency }) {
  const changes = useChanges(run.id);
  const [results, setResults] = useState<Results | null>(null);
  const [problem, setProblem] = useState<Problem | null | undefined>(undefined);

  useEffect(() => {
    getResults(run.id)
      .then(setResults)
      .catch((error) => setProblem(error instanceof ApiError ? error.problem : null));
  }, [run.id]);

  if (problem !== undefined) return <ErrorNotice problem={problem} />;
  if (!results) return <Loader mx="auto" mt="xl" />;
  const money = results.currency ?? currency;
  const summary = results.summary ?? {
    accounts: results.accounts.length,
    high: results.distribution.levels.high ?? 0,
    elevated: results.distribution.levels.elevated ?? 0,
    normal: results.distribution.levels.normal ?? 0,
    snapshot_date: null,
  };
  const facts: Facts = {
    summary,
    previous: results.previous ?? null,
    currency: money,
    rate: latestRate(results.trend),
  };

  return (
    <div className={classes.stack}>
      <Slot name="note" area="sky" />
      <Hero results={results} facts={facts} />
      {changes?.base && <ChangesPanel changes={changes} />}
      <AtRiskTable results={results} currency={money} />
      <div className={classes.row}>
        <TrendChart trend={results.trend} />
        <RiskHistogram results={results} />
      </div>
      <Findings insights={results.insights} runId={results.run.id} />
      <div className={classes.split}>
        <TopReasons results={results} />
        <DataNotes results={results} />
      </div>
    </div>
  );
}
