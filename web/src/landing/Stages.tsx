// How it works: the product's progress bar, enlarged to the page. Each part's width follows how
// long it really took on our 80-customer demo (reading 45 s, preparing 25 s, the model 2 min; the
// review is the customer's own time), and the bar lights up part by part like the real one.
import { useI18n, type Key } from "../i18n";
import classes from "./Landing.module.css";
import { order } from "./reveal";

const PARTS: { key: "read" | "review" | "prepare" | "model"; grow: number }[] = [
  { key: "read", grow: 45 },
  { key: "review", grow: 30 },
  { key: "prepare", grow: 25 },
  { key: "model", grow: 135 },
];

export function Stages() {
  const { t } = useI18n();
  return (
    <section id="how" className={classes.section} aria-labelledby="how-title">
      <h2 id="how-title" className={`${classes.display} ${classes.heading}`} data-reveal>
        {t("landing.how.title")}
      </h2>
      <ol className={classes.bar} data-ui data-playing="false" data-reveal style={order(1)}>
        {PARTS.map(({ key, grow }) => (
          <li key={key} className={classes.segment} style={{ flex: `${grow} 1 0` }}>
            <div className={classes.fill} aria-hidden="true" />
            <div className={classes.segmentInner}>
              <span className={classes.time}>{t(`landing.how.${key}.time` as Key)}</span>
              <span className={classes.segmentText}>{t(`landing.how.${key}.text` as Key)}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className={classes.note} data-reveal style={order(2)}>
        {t("landing.how.note")}
      </p>
    </section>
  );
}
