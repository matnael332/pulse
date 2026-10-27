// The model behind a run (?view=model): how good it is, the models it was chosen from, what drives
// it, the company's runs, its reports and figures. Its own bundle, with the charts and the markdown.
import "@mantine/charts/styles.css";

import { BarChart } from "@mantine/charts";
import { Loader, SegmentedControl, Table, Typography } from "@mantine/core";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";

import { figureUrl, getAdvanced, getDoc, type Advanced, type RunInfo } from "../api";
import { type Key, useI18n } from "../i18n";
import classes from "./Dashboard.module.css";

const METRICS = [
  "roc_auc",
  "pr_auc",
  "precision_at_top10pct",
  "lift_at_top10pct",
  "brier",
] as const;

// The page has one h1: a report's headings step down under the panel's own h2.
const HEADINGS = { h1: "h3", h2: "h4", h3: "h5", h4: "h6" } as const;

/** The reports carry a few HTML notes (provenance in <sub>); markdown here renders no HTML. */
function withoutHtml(markdown: string): string {
  return markdown.replace(/<sub>[\s\S]*?<\/sub>/g, "");
}

function show(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(3);
}

export default function ModelView({ runId, runs }: { runId: string; runs: RunInfo[] }) {
  const { t, locale } = useI18n();
  const [advanced, setAdvanced] = useState<Advanced | null>(null);
  const [doc, setDoc] = useState<string>("model_card");
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    void getAdvanced(runId).then(setAdvanced);
  }, [runId]);
  useEffect(() => {
    setText(null);
    void getDoc(runId, doc)
      .then(setText)
      .catch(() => setText(""));
  }, [runId, doc]);

  if (!advanced) return <Loader mx="auto" mt="xl" />;
  const selected = advanced.selected_model ? advanced.candidates[advanced.selected_model] : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const count = new Intl.NumberFormat(locale);

  return (
    <div className={classes.stack}>
      {selected && (
        <section className={`${classes.panel} ${classes.flush}`} aria-labelledby="metrics-title">
          <div className={classes.panelHead}>
            <h2 id="metrics-title" className={`${classes.display} ${classes.panelTitle}`}>
              {t("advanced.metrics")}
            </h2>
            {advanced.threshold !== null && (
              <p className={classes.note}>
                {t("advanced.threshold", { value: advanced.threshold.toFixed(3) })}
              </p>
            )}
          </div>
          <dl className={`${classes.strip} ${classes.five}`}>
            {METRICS.map((metric) => (
              <div key={metric}>
                <dt>{t(`advanced.${metric}` as Key)}</dt>
                <dd className={classes.value}>{show(selected.test[metric])}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className={`${classes.split} ${classes.wideFirst}`}>
        <section className={`${classes.panel} ${classes.flush}`} aria-labelledby="candidates-title">
          <div className={classes.panelHead}>
            <h2 id="candidates-title" className={`${classes.display} ${classes.panelTitle}`}>
              {t("advanced.candidates")}
            </h2>
          </div>
          <Table.ScrollContainer minWidth={760}>
            <Table className={classes.table}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("advanced.model")}</Table.Th>
                  {METRICS.map((m) => (
                    <Table.Th key={m} className={classes.num}>
                      {t(`advanced.${m}` as Key)}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(advanced.candidates).map(([name, candidate]) => (
                  <Table.Tr key={name}>
                    <Table.Td>
                      <span className={classes.code} dir="ltr">
                        {name}
                      </span>
                      {name === advanced.selected_model && (
                        <span className={classes.tag}>{t("advanced.selected")}</span>
                      )}
                    </Table.Td>
                    {METRICS.map((m) => (
                      <Table.Td key={m} className={classes.num}>
                        {show(candidate.test[m])}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </section>
        {runs.length > 0 && (
          <section className={classes.panel} aria-labelledby="history-title">
            <div className={classes.panelHead}>
              <h2 id="history-title" className={`${classes.display} ${classes.panelTitle}`}>
                {t("advanced.history")}
              </h2>
            </div>
            <ol className={classes.history}>
              {runs.map((run) => (
                <li key={run.id}>
                  <Link
                    to={
                      run.status === "succeeded" ? `/dashboard/${run.id}` : `/data/runs/${run.id}`
                    }
                    className={classes.link}
                    aria-current={run.id === runId ? "page" : undefined}
                  >
                    {date.format(new Date(run.created_at))}
                  </Link>
                  <span className={classes.muted}>
                    {run.demo && <span className={classes.tag}>{t("common.demo")}</span>}
                    {run.summary
                      ? t("home.accounts", { count: count.format(run.summary.accounts) })
                      : run.status}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {advanced.importance.length > 0 && (
        <section className={classes.panel} aria-labelledby="importance-title">
          <div className={classes.panelHead}>
            <h2 id="importance-title" className={`${classes.display} ${classes.panelTitle}`}>
              {t("advanced.importance")}
            </h2>
          </div>
          <div dir="ltr">
            <BarChart
              h={Math.max(200, advanced.importance.length * 28)}
              dataKey="feature"
              orientation="vertical"
              yAxisProps={{ width: 220 }}
              data={advanced.importance.map((f) => ({
                feature: f.feature,
                importance: f.importance_mean,
              }))}
              series={[{ name: "importance", label: t("advanced.importance"), color: "ink.0" }]}
              gridAxis="y"
              tickLine="none"
              gridColor="#1f1f1f"
              textColor="#949494"
              barProps={{ radius: 0 }}
              valueFormatter={(v) => v.toFixed(3)}
            />
          </div>
        </section>
      )}

      {advanced.docs.length > 0 && (
        <section className={classes.panel} aria-labelledby="docs-title">
          <div className={classes.panelHead}>
            <h2 id="docs-title" className={`${classes.display} ${classes.panelTitle}`}>
              {t("advanced.docs")}
            </h2>
            <SegmentedControl
              radius="xl"
              value={doc}
              onChange={setDoc}
              data={advanced.docs.map((d) => ({ value: d, label: t(`advanced.${d}` as Key) }))}
            />
          </div>
          <p className={classes.note}>{t("advanced.englishOnly")}</p>
          {text === null ? (
            <Loader size="sm" mt="md" />
          ) : (
            <Typography dir="ltr" data-testid="report" className={classes.report}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={HEADINGS}>
                {withoutHtml(text)}
              </ReactMarkdown>
            </Typography>
          )}
        </section>
      )}

      {advanced.figures.length > 0 && (
        <section className={classes.panel} aria-labelledby="figures-title">
          <div className={classes.panelHead}>
            <h2 id="figures-title" className={`${classes.display} ${classes.panelTitle}`}>
              {t("advanced.figures")}
            </h2>
          </div>
          <div className={classes.gallery}>
            {advanced.figures.map((name) => (
              <figure key={name}>
                {/* the common size, so the space is kept while it loads; the picture keeps its own shape */}
                <img
                  src={figureUrl(runId, name)}
                  alt={name}
                  width={660}
                  height={550}
                  loading="lazy"
                />
                <figcaption dir="ltr">{name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
