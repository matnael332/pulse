// The latest result as a sky: one point per scored account, the ones at high risk in red, and the
// figures under it (the revenue at risk in the company's currency). Before any result, the empty sky.
import { Button } from "@mantine/core";
import { Link } from "react-router";

import type { MyCompany } from "../api";
import { useI18n } from "../i18n";
import { Orbit, panelGeometry } from "../landing/Orbit";
import classes from "./Data.module.css";

export function LatestPanel({ company }: { company: MyCompany | null }) {
  const { t, lang, locale } = useI18n();
  const run = company?.latest_run;
  const summary = run?.summary;
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: company?.currency ?? "ILS",
    maximumFractionDigits: 0,
  });
  const count = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" });

  return (
    <section className={`${classes.panel} ${classes.result}`} aria-labelledby="latest-title">
      <Orbit
        key={run?.id ?? "empty"}
        className={classes.sky}
        rtl={lang === "he"}
        layout={panelGeometry}
        result={{ accounts: summary?.accounts ?? 0, risk: summary?.high ?? 0 }}
      />
      <div className={classes.over}>
        <h2 id="latest-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("home.latest")}
        </h2>
        <p className={classes.panelLead}>
          {run && summary
            ? [
                run.demo ? t("common.demo") : null,
                run.finished_at ? date.format(new Date(run.finished_at)) : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : t("data.empty")}
        </p>
      </div>
      {run && summary && (
        <div className={classes.over}>
          <div className={classes.figures}>
            <div className={classes.figure}>
              <span>{t("run.accounts")}</span>
              <b>{count.format(summary.accounts)}</b>
            </div>
            <div className={`${classes.figure} ${classes.risk}`}>
              <span>{t("run.high")}</span>
              <b>{count.format(summary.high)}</b>
            </div>
            {summary.revenue_at_risk != null && (
              <div className={`${classes.figure} ${classes.risk}`}>
                <span>{t("data.revenue")}</span>
                <b>{money.format(summary.revenue_at_risk)}</b>
              </div>
            )}
          </div>
          <Button component={Link} to={`/dashboard/${run.id}`} variant="default" mt="lg">
            {t("data.dashboard")}
          </Button>
        </div>
      )}
    </section>
  );
}
