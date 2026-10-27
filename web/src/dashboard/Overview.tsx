// The dashboard's overview of one run: what is at stake (the company's accounts as a sky, the
// revenue at risk and the counts), who is at risk, why, and the trend. Its own bundle, with the
// charts.
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
import { Orbit } from "../landing/Orbit";
import type { Geometry } from "../landing/sky";
import { AtRiskTable } from "./AtRiskTable";
import { RiskHistogram, TrendChart } from "./Charts";
import classes from "./Dashboard.module.css";
import { previousRun } from "./deltas";
import { Counts, type Facts, Revenue } from "./Kpis";
import { latestRate } from "./figures";
import { DataNotes, Findings, TopReasons } from "./Words";

/** The sky across the panel, the planet on the far side from the figure; on a phone, above it. */
function wide(width: number, height: number, rtl: boolean): Geometry {
  if (width < 700) {
    return { cx: width * 0.5, cy: height * 0.5, radius: Math.min(height * 0.42, width * 0.2) };
  }
  return {
    cx: width * (rtl ? 0.26 : 0.74),
    cy: height * 0.5,
    radius: Math.min(height * 0.62, width * 0.17),
  };
}

/** What is at stake: the company's accounts as a sky, the revenue at risk, the counts. */
function Hero({ results, facts }: { results: Results; facts: Facts }) {
  const { lang } = useI18n();
  return (
    <section className={`${classes.panel} ${classes.hero}`}>
      <div className={classes.heroSky}>
        <Orbit
          key={results.run.id}
          className={classes.sky}
          rtl={lang === "he"}
          layout={wide}
          result={{ accounts: facts.summary.accounts, risk: facts.summary.high }}
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

export default function Overview({
  run,
  runs,
  currency,
}: {
  run: RunInfo;
  runs: RunInfo[];
  currency: Currency;
}) {
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
    previous: previousRun(runs, run),
    currency: money,
    rate: latestRate(results.trend),
  };

  return (
    <div className={classes.stack}>
      <Hero results={results} facts={facts} />
      <AtRiskTable results={results} currency={money} />
      <div className={classes.row}>
        <TrendChart trend={results.trend} />
        <RiskHistogram results={results} />
      </div>
      <Findings insights={results.insights} />
      <div className={classes.split}>
        <TopReasons results={results} />
        <DataNotes results={results} />
      </div>
    </div>
  );
}
