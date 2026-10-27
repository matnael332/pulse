// Connecting systems directly, instead of a file: coming in version 2. Each row names the system
// and the data it would bring (the product's own group names); none can be connected yet.
import { Button } from "@mantine/core";

import { useI18n, type Key } from "../i18n";
import { label } from "../labels";
import classes from "./Data.module.css";

const SYSTEMS: { key: string; data: (lang: "he" | "en") => string }[] = [
  { key: "payroll", data: (lang) => label.group("payroll", lang) },
  { key: "billing", data: (lang) => label.group("commercial", lang) },
  { key: "attendance", data: (lang) => label.group("punches", lang) },
  { key: "usage", data: (lang) => label.group("usage", lang) },
  { key: "support", data: (lang) => label.reason("support", lang) },
];

export function Systems() {
  const { t, lang } = useI18n();
  return (
    <section className={`${classes.panel} ${classes.systems}`} aria-labelledby="systems-title">
      <h2 id="systems-title" className={`${classes.display} ${classes.panelTitle}`}>
        {t("systems.title")}
      </h2>
      <p className={classes.panelLead}>{t("systems.lead")}</p>
      <table className={classes.table}>
        <tbody>
          {SYSTEMS.map(({ key, data }) => (
            <tr key={key}>
              <td className={classes.systemName}>{t(`systems.${key}` as Key)}</td>
              <td className={classes.muted}>{data(lang)}</td>
              <td>
                <span className={classes.soon}>{t("systems.soon")}</span>
                <Button variant="default" size="compact-md" disabled>
                  {t("systems.connect")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
