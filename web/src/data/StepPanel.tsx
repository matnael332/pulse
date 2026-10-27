// One step's panel, composed like the landing page's first screen: the words on one side, the sky
// on the far side (the latest result's accounts, or an empty sky before there is one).
import type { ReactNode } from "react";

import type { MyCompany } from "../api";
import { useI18n } from "../i18n";
import { Orbit, panelGeometry } from "../landing/Orbit";
import classes from "./Data.module.css";

export function StepPanel({
  company,
  labelledBy,
  children,
}: {
  company: MyCompany | null;
  labelledBy?: string;
  children: ReactNode;
}) {
  const { lang } = useI18n();
  const summary = company?.latest_run?.summary;
  return (
    <section className={`${classes.panel} ${classes.stepPanel}`} aria-labelledby={labelledBy}>
      <Orbit
        key={company?.latest_run?.id ?? "empty"}
        className={classes.sky}
        rtl={lang === "he"}
        layout={panelGeometry}
        result={{ accounts: summary?.accounts ?? 0, risk: summary?.high ?? 0 }}
      />
      <div className={classes.stepContent}>{children}</div>
    </section>
  );
}
