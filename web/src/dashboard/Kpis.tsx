// The headline figures: the revenue at risk (the dashboard's answer) and the counts, each with
// its change since the previous run of the same kind, named by that run's date. A figure that is
// not known is a grey dash, and so is a change with nothing to compare.
import { VisuallyHidden } from "@mantine/core";

import type { Currency, RunInfo, RunSummary } from "../api";
import { useI18n } from "../i18n";
import classes from "./Dashboard.module.css";
import { delta, type Figure } from "./deltas";

export interface Facts {
  summary: RunSummary;
  previous: RunInfo | null;
  currency: Currency;
  rate: { month: string; rate: number } | null;
}

function useFormats(currency: Currency) {
  const { locale } = useI18n();
  return {
    count: new Intl.NumberFormat(locale),
    change: new Intl.NumberFormat(locale, { signDisplay: "exceptZero" }),
    money: new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }),
    moneyChange: new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      signDisplay: "exceptZero",
    }),
    percent: new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

function Change({ facts, figure, money }: { facts: Facts; figure: Figure; money?: boolean }) {
  const { t } = useI18n();
  const f = useFormats(facts.currency);
  const change = delta(figure, facts.summary, facts.previous?.summary ?? null);
  const when = facts.previous?.finished_at ?? facts.previous?.created_at;
  if (!change || !when) {
    return (
      <dd className={classes.change} title={t("dashboard.noCompare")}>
        <span aria-hidden="true">—</span>
        <VisuallyHidden>{t("dashboard.noCompare")}</VisuallyHidden>
      </dd>
    );
  }
  return (
    <dd className={classes.change}>
      <span dir="ltr" className={change.bad ? classes.bad : undefined}>
        {(money ? f.moneyChange : f.change).format(change.change)}
      </span>{" "}
      {t("dashboard.vs", { date: f.date.format(new Date(when)) })}
    </dd>
  );
}

/** The money at stake: the monthly revenue of the accounts at high risk, out of all of it. */
export function Revenue({ facts, className = "" }: { facts: Facts; className?: string }) {
  const { t } = useI18n();
  const f = useFormats(facts.currency);
  const { revenue_at_risk: risk, revenue_total: total } = facts.summary;
  return (
    <div className={`${classes.answer} ${className}`}>
      <dt>{t("data.revenue")}</dt>
      <dd className={classes.value}>{risk == null ? "—" : f.money.format(risk)}</dd>
      {total != null && (
        <dd className={classes.of}>{t("dashboard.of", { total: f.money.format(total) })}</dd>
      )}
      <Change facts={facts} figure="revenue_at_risk" money />
    </div>
  );
}

/** The counts: accounts, at high risk, elevated, and the newest month's cancellation rate. */
export function Counts({ facts }: { facts: Facts }) {
  const { t } = useI18n();
  const f = useFormats(facts.currency);
  const { summary, rate } = facts;
  return (
    <>
      <div>
        <dt>{t("run.accounts")}</dt>
        <dd className={classes.value}>{f.count.format(summary.accounts)}</dd>
        <Change facts={facts} figure="accounts" />
      </div>
      <div className={classes.high}>
        <dt>{t("run.high")}</dt>
        <dd className={classes.value}>{f.count.format(summary.high)}</dd>
        <Change facts={facts} figure="high" />
      </div>
      <div>
        <dt>{t("run.elevated")}</dt>
        <dd className={classes.value}>{f.count.format(summary.elevated)}</dd>
        <Change facts={facts} figure="elevated" />
      </div>
      <div>
        <dt>
          {rate
            ? t("dashboard.rate", { month: f.month.format(new Date(`${rate.month}-01T00:00:00Z`)) })
            : t("results.rate")}
        </dt>
        <dd className={classes.value}>{rate ? f.percent.format(rate.rate) : "—"}</dd>
      </div>
    </>
  );
}
