// A risk level as the tables say it: the customer's point (red when high) and the words.
import type { ScoredAccount } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import classes from "./Dashboard.module.css";

export function Level({ level }: { level: ScoredAccount["level"] | null }) {
  const { lang } = useI18n();
  if (!level) return <span className={classes.muted}>—</span>;
  return (
    <span className={classes.level} data-level={level}>
      <span className="point" data-level={level} aria-hidden="true" />
      {label.risk(level, lang)}
    </span>
  );
}
