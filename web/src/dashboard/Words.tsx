// The dashboard's words: why the accounts at high risk are at risk (the reasons they share), what
// the language model found, and what to know about the data the model learnt from.
import type { Results } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import classes from "./Dashboard.module.css";
import { topReasons } from "./figures";

export function TopReasons({ results }: { results: Results }) {
  const { t, lang, locale } = useI18n();
  const reasons = topReasons(results.accounts);
  const most = reasons[0]?.count ?? 1;
  const count = new Intl.NumberFormat(locale);
  return (
    <section className={classes.panel} aria-labelledby="reasons-title">
      <div className={classes.panelHead}>
        <h2 id="reasons-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("dashboard.reasons")}
        </h2>
      </div>
      {reasons.length === 0 ? (
        <p className={classes.note}>{t("dashboard.reasonsNone")}</p>
      ) : (
        <ol className={classes.bars}>
          {reasons.map((r) => (
            <li key={r.code}>
              <div>
                <span>{label.reason(r.code, lang)}</span>
                <span className={classes.num}>{count.format(r.count)}</span>
              </div>
              <div className={classes.track} style={{ width: `${(r.count / most) * 88}%` }} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Findings({ insights }: { insights: Results["insights"] }) {
  const { t, lang } = useI18n();
  if (!insights.headline) return null;
  return (
    <section className={classes.panel} aria-labelledby="findings-title">
      <div className={classes.panelHead}>
        <h2 id="findings-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.insights")}
        </h2>
      </div>
      <div dir={insights.language === "he" ? "rtl" : "ltr"} className={classes.columns}>
        <p className={classes.headline}>{insights.headline}</p>
        {(insights.key_findings ?? []).length > 0 && (
          <ul className={classes.list}>
            {insights.key_findings!.map((f) => (
              <li key={f.title}>
                <b>{f.title}.</b> {f.evidence} {f.business_meaning}
              </li>
            ))}
          </ul>
        )}
        {(insights.recommendations ?? []).length > 0 && (
          <>
            <p className={classes.subhead}>{t("results.recommendations")}</p>
            <ul className={classes.list}>
              {insights.recommendations!.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {(insights.source === "template" || insights.language !== lang) && (
        <p className={classes.note}>
          {insights.source === "template"
            ? t("results.template")
            : insights.language === "he"
              ? t("results.otherLanguageHe")
              : t("results.otherLanguage")}
        </p>
      )}
    </section>
  );
}

export function DataNotes({ results }: { results: Results }) {
  const { t, lang, locale } = useI18n();
  const missing = results.groups.missing ?? [];
  const windows = results.data.windows;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  return (
    <section className={`${classes.panel} ${classes.notes}`} aria-labelledby="notes-title">
      <div className={classes.panelHead}>
        <h2 id="notes-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.dataNotes")}
        </h2>
      </div>
      <p>
        {missing.length
          ? t("results.groupsMissing", {
              groups: missing.map((g) => label.group(g, lang)).join(", "),
            })
          : t("results.allGroups")}
      </p>
      {windows?.train && windows?.test && (
        <p className={classes.muted}>
          {t("results.windows", {
            train: `${date(windows.train[0])}–${date(windows.train[1])}`,
            test: `${date(windows.test[0])}–${date(windows.test[1])}`,
          })}
        </p>
      )}
      {results.data.cancellations && (
        <p className={classes.muted}>
          {t("results.cancellations", {
            train: String(results.data.cancellations.train),
            test: String(results.data.cancellations.test),
          })}
        </p>
      )}
      {results.data.low_confidence && <p className={classes.muted}>{t("results.lowConfidence")}</p>}
    </section>
  );
}
