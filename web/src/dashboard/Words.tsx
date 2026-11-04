// The dashboard's words: why the accounts at high risk are at risk (the reasons they share), what
// the language model found (in the reader's language: translated once when the run was written in
// the other one; a run without the model has only general text, which is not shown), and what to
// know about the data the model learnt from.
import { useEffect, useRef, useState } from "react";

import { translateInsights, type Results } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { useSession } from "../session";
import classes from "./Dashboard.module.css";
import { day } from "./deltas";
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

export function Findings({ insights, runId }: { insights: Results["insights"]; runId: string }) {
  const { t, lang } = useI18n();
  const { me } = useSession();
  // the translations asked for, by run and language (null: none came, the original stays)
  const [translations, setTranslations] = useState<Record<string, Results["insights"] | null>>({});
  const asked = useRef(new Set<string>());
  const key = `${runId}:${lang}`;
  // the general text of a run without the language model is technical, and its figures are shown
  // elsewhere on the page: no panel for it, and nothing to translate
  const written = Boolean(insights.headline) && insights.source !== "template";
  const wanted = written && insights.language !== lang && Boolean(me?.llm);

  useEffect(() => {
    if (!wanted || asked.current.has(key)) return;
    asked.current.add(key);
    translateInsights(runId, lang)
      .then((answer) =>
        setTranslations((was) => ({ ...was, [key]: answer.translated ? answer.insights : null })),
      )
      .catch(() => setTranslations((was) => ({ ...was, [key]: null })));
  }, [wanted, key, runId, lang]);

  if (!written) return null;
  const translation = wanted ? translations[key] : undefined;
  const pending = wanted && !(key in translations);
  const shown = translation ?? insights;
  const other = insights.language === "he" ? "results.otherLanguageHe" : "results.otherLanguage";
  const from = insights.language === "he" ? "results.translatedFromHe" : "results.translatedFromEn";
  const notes = [
    translation
      ? t(from)
      : pending
        ? t("results.translating")
        : insights.language !== lang
          ? t(other)
          : null,
  ].filter((note): note is string => note !== null);

  return (
    <section className={classes.panel} aria-labelledby="findings-title">
      <div className={classes.panelHead}>
        <h2 id="findings-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.insights")}
        </h2>
      </div>
      <div dir={shown.language === "he" ? "rtl" : "ltr"} className={classes.columns}>
        <p className={classes.headline}>{shown.headline}</p>
        {(shown.key_findings ?? []).length > 0 && (
          <ul className={classes.list}>
            {shown.key_findings!.map((f) => (
              <li key={f.title}>
                <b>{f.title}.</b> {f.evidence} {f.business_meaning}
              </li>
            ))}
          </ul>
        )}
        {(shown.recommendations ?? []).length > 0 && (
          <>
            <p className={classes.subhead}>{t("results.recommendations")}</p>
            <ul className={classes.list}>
              {shown.recommendations!.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div aria-live="polite">
        {notes.map((note) => (
          <p key={note} className={classes.note}>
            {note}
          </p>
        ))}
      </div>
    </section>
  );
}

export function DataNotes({ results }: { results: Results }) {
  const { t, lang, locale } = useI18n();
  const missing = results.groups.missing ?? [];
  const windows = results.data.windows;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(day(value));
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
