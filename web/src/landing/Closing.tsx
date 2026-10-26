// The close: one question across the whole screen, its two lines at the top and bottom edges, and
// the two answers (Google or Microsoft) held between them.
import { useI18n } from "../i18n";
import classes from "./Landing.module.css";
import { SignIn } from "./SignIn";

export function Closing({
  providers,
  onError,
}: {
  providers: string[] | null;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section id="start" className={classes.close} aria-labelledby="start-title">
      <h2 id="start-title" className={`${classes.display} ${classes.question}`}>
        <span>{t("landing.start.q1")}</span> <span>{t("landing.start.q2")}</span>
      </h2>
      <div className={classes.choice}>
        <SignIn providers={providers} short onError={onError} />
        <p className={classes.small}>{t("landing.start.after")}</p>
      </div>
    </section>
  );
}
