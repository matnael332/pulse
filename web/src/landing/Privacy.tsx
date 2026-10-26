// Your data stays yours: what happens to names, and what the language model sees. The circle holds
// a piece of the real review screen as our demo export shows it: 10 data groups, 13 tables, and
// three personal columns of the employees sheet left out (their names are the export's own).
import { useI18n } from "../i18n";
import classes from "./Landing.module.css";
import { order } from "./reveal";

const LEFT_OUT = ["שם עובד", "ת.ז.", "טלפון"];

export function Privacy() {
  const { t } = useI18n();
  return (
    <section id="privacy" className={classes.panel} aria-labelledby="privacy-title">
      <h2 id="privacy-title" className={`${classes.display} ${classes.statement}`} data-reveal>
        {t("landing.privacy.title1")} <br />
        {t("landing.privacy.title2")}
      </h2>
      <div className={classes.points}>
        <div data-reveal style={order(1)}>
          <h3>{t("landing.privacy.names.title")}</h3>
          <p>{t("landing.privacy.names.body")}</p>
        </div>
        <div data-reveal style={order(2)}>
          <h3>{t("landing.privacy.headers.title")}</h3>
          <p>{t("landing.privacy.headers.body")}</p>
        </div>
        <div data-reveal style={order(3)}>
          <a className={`${classes.button} ${classes.filled}`} href="#start">
            {t("landing.privacy.cta")}
          </a>
        </div>
      </div>
      <div className={classes.lens} data-ui data-reveal style={order(1)}>
        <ul>
          <li>{t("landing.privacy.groups", { count: "10" })}</li>
          <li>{t("landing.privacy.tables", { count: "13" })}</li>
          <li>{t("landing.privacy.personal", { count: String(LEFT_OUT.length) })}</li>
        </ul>
        <div className={classes.chips} dir="rtl">
          {LEFT_OUT.map((name) => (
            <span key={name} className={`${classes.chip} ${classes.struck}`}>
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
