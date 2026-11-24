// The two charts: the cancellation rate by month (straight lines, the newest month marked; a month
// without a rate is a gap, never a zero) and how likely the accounts are to leave, by tenths, the
// ones at high risk in red. Time and probability run left to right in both languages.
import { BarChart, LineChart } from "@mantine/charts";

import type { Results } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { Slot } from "../slots";
import classes from "./Dashboard.module.css";
import { histogram, latestRate, ticks } from "./figures";

const HEIGHT = 280;

export function TrendChart({ trend }: { trend: Results["trend"] }) {
  const { t, locale } = useI18n();
  const month = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const name = (key: string) => month.format(new Date(`${key}-01T00:00:00Z`));
  const data = trend.map((p) => ({
    month: name(p.month),
    rate: p.rate == null ? null : p.rate * 100,
  }));
  const newest = latestRate(trend);
  return (
    <section className={classes.panel} aria-labelledby="trend-title">
      <div className={classes.panelHead}>
        <h2 id="trend-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.trend")}
        </h2>
      </div>
      <Slot name="note" area="trend" />
      <div dir="ltr">
        <LineChart
          h={HEIGHT}
          data={data}
          dataKey="month"
          series={[{ name: "rate", label: t("results.rate"), color: "ink.5" }]}
          referenceDots={
            newest ? [{ x: name(newest.month), y: newest.rate * 100, color: "ink.0" }] : undefined
          }
          curveType="linear"
          withDots={false}
          connectNulls={false}
          strokeWidth={2}
          gridAxis="x"
          tickLine="none"
          gridColor="#1f1f1f"
          textColor="#949494"
          valueFormatter={(v) => `${v.toFixed(1)}%`}
          yAxisProps={{
            width: 40,
            domain: [0, "auto"],
            tickFormatter: (v: number) => `${Math.round(v)}%`,
          }}
          xAxisProps={{ interval: "preserveStartEnd", minTickGap: 48 }}
        />
      </div>
    </section>
  );
}

export function RiskHistogram({ results }: { results: Results }) {
  const { t, lang } = useI18n();
  const data = histogram(results.accounts).map((bin) => ({
    range: `${Math.round(bin.from * 100)}–${Math.round(bin.to * 100)}%`,
    high: bin.high,
    others: bin.others,
  }));
  const marks = ticks(Math.max(0, ...data.map((bin) => bin.high + bin.others)));
  return (
    <section className={classes.panel} aria-labelledby="distribution-title">
      <div className={classes.panelHead}>
        <h2 id="distribution-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.distribution")}
        </h2>
        <div className={classes.legend}>
          <span>
            <span className="point" data-level="high" aria-hidden="true" />
            {label.risk("high", lang)}
          </span>
          <span>
            <span className="point" aria-hidden="true" />
            {t("dashboard.others")}
          </span>
        </div>
      </div>
      <Slot name="note" area="distribution" />
      <div dir="ltr">
        <BarChart
          h={HEIGHT}
          data={data}
          dataKey="range"
          type="stacked"
          series={[
            { name: "high", label: label.risk("high", lang), color: "red.5" },
            { name: "others", label: t("dashboard.others"), color: "ink.5" },
          ]}
          gridAxis="x"
          tickLine="none"
          gridColor="#1f1f1f"
          textColor="#949494"
          barProps={{ radius: 0 }}
          yAxisProps={{
            width: 32,
            allowDecimals: false,
            ticks: marks,
            domain: [0, marks[marks.length - 1]],
          }}
          xAxisProps={{ interval: "preserveStartEnd", minTickGap: 12 }}
        />
      </div>
    </section>
  );
}
