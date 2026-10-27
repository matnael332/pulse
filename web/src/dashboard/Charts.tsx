// The two charts: the cancellation rate by month (straight lines; a month without a rate is a gap,
// never a zero) and how likely the accounts are to leave, by tenths, the ones at high risk in red.
// Time and probability run left to right in both languages.
import { BarChart, LineChart } from "@mantine/charts";

import type { Results } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import classes from "./Dashboard.module.css";
import { histogram } from "./figures";

export function TrendChart({ trend }: { trend: Results["trend"] }) {
  const { t } = useI18n();
  const data = trend.map((p) => ({ month: p.month, rate: p.rate == null ? null : p.rate * 100 }));
  return (
    <section className={classes.panel} aria-labelledby="trend-title">
      <div className={classes.panelHead}>
        <h2 id="trend-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.trend")}
        </h2>
      </div>
      <div dir="ltr">
        <LineChart
          h={220}
          data={data}
          dataKey="month"
          series={[{ name: "rate", label: t("results.rate"), color: "ink.0" }]}
          curveType="linear"
          withDots={false}
          connectNulls={false}
          strokeWidth={2}
          gridAxis="x"
          tickLine="none"
          gridColor="#1f1f1f"
          textColor="#949494"
          valueFormatter={(v) => `${v.toFixed(1)}%`}
          yAxisProps={{ width: 48, domain: [0, "auto"] }}
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
  return (
    <section className={classes.panel} aria-labelledby="distribution-title">
      <div className={classes.panelHead}>
        <h2 id="distribution-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.distribution")}
        </h2>
        <div className={classes.legend}>
          <span className={classes.legendHigh}>{label.risk("high", lang)}</span>
          <span>{t("dashboard.others")}</span>
        </div>
      </div>
      <div dir="ltr">
        <BarChart
          h={220}
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
          yAxisProps={{ width: 32, allowDecimals: false }}
          xAxisProps={{ interval: "preserveStartEnd", minTickGap: 12 }}
        />
      </div>
    </section>
  );
}
