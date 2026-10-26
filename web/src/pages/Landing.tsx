// The public page: what pulse does and the way in. The orbit behind the first screen, how it
// works, a sample customer's reasons, what happens to the data, and the question to close. A failed
// sign-in comes back here (/login?error=...).
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { getProviders } from "../api";
import { Wordmark } from "../components/Wordmark";
import { useI18n } from "../i18n";
import { Closing } from "../landing/Closing";
import { Footer } from "../landing/Footer";
import classes from "../landing/Landing.module.css";
import { Orbit } from "../landing/Orbit";
import { Privacy } from "../landing/Privacy";
import { order, useReveal } from "../landing/reveal";
import { Showcase } from "../landing/Showcase";
import { SignIn } from "../landing/SignIn";
import { Stages } from "../landing/Stages";

export function Landing() {
  const { t, lang, setLang } = useI18n();
  const [params] = useSearchParams();
  const [providers, setProviders] = useState<string[] | null>(null);
  const [error, setError] = useState(params.get("error") ? t("login.failed") : "");
  const [paused, setPaused] = useState(false); // the visitor may stop everything that moves
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  useEffect(() => {
    getProviders()
      .then((answer) => setProviders(answer.providers))
      .catch(() => setProviders([]));
  }, []);

  return (
    <div className={classes.page} ref={root} data-paused={paused || undefined}>
      <a className={classes.skip} href="#main">
        {t("landing.skip")}
      </a>
      <header className={classes.nav}>
        <Wordmark />
        <nav className={classes.navLinks}>
          <a className={classes.navLink} href="#how">
            {t("landing.nav.how")}
          </a>
          <a className={classes.navLink} href="#privacy">
            {t("landing.nav.privacy")}
          </a>
          <a className={classes.navLink} href="#start">
            {t("landing.nav.start")}
          </a>
          <button
            type="button"
            className={classes.langButton}
            onClick={() => setLang(lang === "he" ? "en" : "he")}
          >
            {t("lang.switch")}
          </button>
        </nav>
      </header>
      <main id="main">
        <section className={classes.hero} aria-labelledby="landing-title">
          <Orbit className={classes.orbit} rtl={lang === "he"} paused={paused} />
          <button
            type="button"
            className={classes.motion}
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {t(paused ? "landing.motion.play" : "landing.motion.pause")}
          </button>
          <div className={classes.heroCopy}>
            <h1 id="landing-title" className={`${classes.display} ${classes.title}`}>
              {t("landing.title1")} <br />
              {t("landing.title2")}
            </h1>
            <p className={classes.lead} data-reveal style={order(1)}>
              {t("landing.lead")}
            </p>
            {error && (
              <p className={classes.error} role="alert">
                {error}
              </p>
            )}
            <div data-reveal style={order(2)}>
              <SignIn providers={providers} onError={setError} />
              <p className={classes.small}>{t("login.footer")}</p>
            </div>
          </div>
        </section>
        <Stages />
        <Showcase />
        <Privacy />
        <Closing providers={providers} onError={setError} />
      </main>
      <Footer />
    </div>
  );
}
