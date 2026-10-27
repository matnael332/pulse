// The first step: the company's name, and the currency its revenue figures are in. It then waits
// for an operator's approval.
import { Alert, Button, TextInput } from "@mantine/core";
import { useState, type FormEvent } from "react";

import { signupCompany, type Currency } from "../api";
import { useI18n } from "../i18n";
import { useSession } from "../session";
import { CurrencyPicker } from "./CurrencyPicker";
import classes from "./Data.module.css";
import { Rail } from "./Rail";
import { StepPanel } from "./StepPanel";

export function CompanyStep() {
  const { t } = useI18n();
  const { refresh } = useSession();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>("ILS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tooShort = name.trim().length < 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort) return;
    setBusy(true);
    try {
      await signupCompany(name.trim(), currency);
      await refresh();
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <>
      <Rail at="company" />
      <StepPanel company={null} labelledBy="company-title">
        <h2 id="company-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("welcome.lead")}
        </h2>
        <form onSubmit={submit}>
          {error && (
            <Alert color="red" variant="light" mb="md">
              {error}
            </Alert>
          )}
          <TextInput
            label={t("welcome.name")}
            value={name}
            maxLength={200}
            autoComplete="organization"
            mb="lg"
            onChange={(event) => setName(event.currentTarget.value)}
            error={name && tooShort ? t("welcome.tooShort") : undefined}
            data-autofocus
          />
          <CurrencyPicker value={currency} onChange={setCurrency} />
          <Button type="submit" loading={busy} disabled={tooShort}>
            {t("welcome.submit")}
          </Button>
        </form>
      </StepPanel>
    </>
  );
}
