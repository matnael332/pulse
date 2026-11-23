// The customers the sky names: the ones at high risk, the most likely to leave first, each with
// what it pays a month (how likely it is to leave, when that is not known).
import type { Currency, ScoredAccount } from "../api";
import { useI18n } from "../i18n";
import type { Named } from "../landing/Orbit";

const MOST = 3; // names at most: more would hide the sky

export function atRisk(accounts: ScoredAccount[], most = MOST): ScoredAccount[] {
  return accounts
    .filter((a) => a.level === "high")
    .sort((a, b) => b.probability - a.probability)
    .slice(0, most);
}

export function useNamed(accounts: ScoredAccount[], currency: Currency): Named[] {
  const { t, locale } = useI18n();
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  return atRisk(accounts).map((a) => ({
    id: a.id,
    name: a.name || a.customer_id || a.id,
    note:
      a.mrr == null
        ? percent.format(a.probability)
        : t("sky.month", { amount: money.format(a.mrr) }),
  }));
}
