// Why they're at risk: the page's one live thing. Pick a sample customer and its card, the way the
// dashboard shows it, comes up on the disc: the risk, the reasons (this month against the usual)
// and the monthly revenue behind it.
import { useState } from "react";

import { useI18n } from "../i18n";
import { label } from "../labels";
import classes from "./Landing.module.css";
import { order } from "./reveal";
import { pick, SAMPLE } from "./sample";

export function Showcase() {
  const { t, lang, locale } = useI18n();
  const [chosen, setChosen] = useState(SAMPLE[0].id);
  const account = SAMPLE.find((a) => a.id === chosen) ?? SAMPLE[0];
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  const shekels = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });

  return (
    <section
      id="why"
      className={`${classes.section} ${classes.showcase}`}
      aria-labelledby="why-title"
    >
      <div data-reveal>
        <h2 id="why-title" className={classes.namesHeading}>
          {t("landing.why.title")}
        </h2>
        <ul className={classes.names} data-ui>
          {SAMPLE.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={classes.name}
                aria-pressed={a.id === chosen}
                onClick={() => setChosen(a.id)}
              >
                <span className={classes.nameText}>{pick(a.name, lang)}</span>
                <span className={`figures ${a.level === "high" ? classes.high : ""}`}>
                  {percent.format(a.probability)}
                </span>
                <span className={classes.level}>{label.risk(a.level, lang)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className={classes.caption}>{t("landing.why.sample")}</p>
      </div>
      <div className={classes.stage} data-reveal style={order(1)}>
        <div className={classes.disc} aria-hidden="true" />
        <div className={classes.cardSlot} aria-live="polite">
          <article key={account.id} className={classes.card} data-ui>
            <p className={classes.cardName}>{pick(account.name, lang)}</p>
            <p className={`${classes.score} ${account.level === "high" ? classes.high : ""}`}>
              <span className="figures">{percent.format(account.probability)}</span> ·{" "}
              {label.risk(account.level, lang)}
            </p>
            <ul className={classes.reasons}>
              {account.reasons.length === 0 && (
                <li>
                  <span>{t("landing.why.none")}</span>
                </li>
              )}
              {account.reasons.map((r) => (
                <li key={r.code}>
                  <b>{label.reason(r.code, lang)}</b>
                  <span>{pick(r.detail, lang)}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
        <p className={classes.fact}>
          {t("landing.why.mrr", { amount: shekels.format(account.mrr) })}
        </p>
      </div>
    </section>
  );
}
