import { SegmentedControl } from "@mantine/core";

import { CURRENCIES, type Currency } from "../api";
import { useI18n } from "../i18n";
import classes from "./Data.module.css";

/** The currency the revenue figures are in: ₪, $ or €. */
export function CurrencyPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={classes.field} role="group" aria-labelledby="currency-label">
      <span id="currency-label" className={classes.fieldLabel}>
        {t("currency.label")}
      </span>
      <SegmentedControl
        value={value}
        onChange={(chosen) => onChange(chosen as Currency)}
        disabled={disabled}
        radius="xl"
        data={CURRENCIES.map((c) => ({ value: c, label: t(`currency.${c}`) }))}
      />
      <p className={classes.hint}>{t("currency.hint")}</p>
    </div>
  );
}
