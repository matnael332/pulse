// The ways in: Google and Microsoft (whichever the server has), and the dev login on a laptop.
import { useState, type FormEvent } from "react";

import { devLogin } from "../api";
import { useI18n } from "../i18n";
import { useSession } from "../session";
import classes from "./Landing.module.css";

interface Props {
  providers: string[] | null;
  short?: boolean; // the closing's "Google or Microsoft"
  onError: (message: string) => void;
}

export function SignIn({ providers, short = false, onError }: Props) {
  const { t } = useI18n();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const has = (name: string) => providers?.includes(name) ?? false;

  async function submitDev(event: FormEvent) {
    event.preventDefault();
    try {
      await devLogin(email);
      await refresh();
    } catch {
      onError(t("login.failed"));
    }
  }

  if (providers === null) return null;
  if (providers.length === 0) {
    return short ? null : <p className={classes.small}>{t("login.none")}</p>;
  }
  const google = has("google") && (
    <a className={`${classes.button} ${classes.filled}`} href="/auth/google/login">
      {short ? t("landing.start.google") : t("login.google")}
    </a>
  );
  const microsoft = has("microsoft") && (
    <a className={classes.button} href="/auth/microsoft/login">
      {short ? t("landing.start.microsoft") : t("login.microsoft")}
    </a>
  );
  return (
    <>
      {short ? (
        <div className={classes.choiceRow}>
          {google}
          {google && microsoft && <span className={classes.or}>{t("landing.start.or")}</span>}
          {microsoft}
        </div>
      ) : (
        (google || microsoft) && (
          <div className={classes.actions}>
            {google}
            {microsoft}
          </div>
        )
      )}
      {has("dev") && (
        <form className={classes.devForm} onSubmit={submitDev}>
          <input
            className={classes.devInput}
            type="email"
            name="email"
            autoComplete="email"
            spellCheck={false}
            required
            placeholder={t("login.devEmail")}
            aria-label={`${t("login.dev")}: ${t("login.devEmail")}`}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <button type="submit" className={classes.button}>
            {t("login.devSubmit")}
          </button>
        </form>
      )}
    </>
  );
}
