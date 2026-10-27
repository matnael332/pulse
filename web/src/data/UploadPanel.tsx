// The upload, the way in: drop the export on the planet (or choose it), send it with a progress
// bar; or try the whole path on our demo data. The currency of the revenue figures sits beside it.
import { Alert, Button, Progress } from "@mantine/core";
import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";

import { ApiError, setCurrency, tryDemo, type MyCompany, type Problem } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { useI18n } from "../i18n";
import { CurrencyPicker } from "./CurrencyPicker";
import classes from "./Data.module.css";
import { useUpload } from "./useUpload";

export function UploadPanel({
  company,
  onCompany,
}: {
  company: MyCompany;
  onCompany: (company: MyCompany) => void;
}) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUpload();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Problem | null>(null);
  const sending = upload.progress !== null;

  function drop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    upload.choose(event.dataTransfer.files[0]);
  }

  async function demo() {
    setBusy(true);
    try {
      const ingestion = await tryDemo(lang);
      navigate(`/data/ingestions/${ingestion.id}`);
    } catch (error) {
      setFailed(error instanceof ApiError ? error.problem : null);
      setBusy(false);
    }
  }

  async function changeCurrency(currency: MyCompany["currency"]) {
    try {
      onCompany({ ...company, ...(await setCurrency(currency)) });
    } catch (error) {
      setFailed(error instanceof ApiError ? error.problem : null);
    }
  }

  return (
    <section className={classes.panel} aria-labelledby="upload-title">
      <h2 id="upload-title" className={`${classes.display} ${classes.panelTitle}`}>
        {t("upload.title")}
      </h2>
      <p className={classes.panelLead}>{t("upload.lead")}</p>
      <div className={classes.launch}>
        <div
          className={classes.planet}
          data-over={over || undefined}
          data-testid="dropzone"
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <div>
            <p className={`${classes.display} ${classes.planetTitle}`}>{t("data.drop")}</p>
            {upload.file && (
              <p className={classes.planetText}>
                {upload.file.name} · {(upload.file.size / (1 << 20)).toFixed(1)} MB
              </p>
            )}
          </div>
        </div>
        <div>
          <CurrencyPicker value={company.currency} onChange={(c) => void changeCurrency(c)} />
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            hidden
            aria-label={t("upload.choose")}
            onChange={(event) => upload.choose(event.currentTarget.files?.[0])}
          />
          {sending ? (
            <div>
              <Progress value={(upload.progress ?? 0) * 100} size="lg" radius="xl" animated />
              <Button mt="sm" variant="subtle" color="gray" onClick={upload.cancel}>
                {t("upload.cancel")}
              </Button>
            </div>
          ) : (
            <div className={classes.actions}>
              {upload.file ? (
                <Button onClick={() => void upload.send()}>{t("upload.send")}</Button>
              ) : (
                <Button onClick={() => input.current?.click()}>{t("upload.choose")}</Button>
              )}
              {upload.file && (
                <Button variant="default" onClick={() => input.current?.click()}>
                  {t("upload.choose")}
                </Button>
              )}
              {!company.has_real_data && (
                <Button variant="default" loading={busy} onClick={() => void demo()}>
                  {t("home.demo")}
                </Button>
              )}
            </div>
          )}
          {!company.has_real_data && <p className={classes.hint}>{t("home.demoHint")}</p>}
        </div>
      </div>
      {upload.local && (
        <Alert mt="lg" color="red" variant="light">
          {upload.local}
        </Alert>
      )}
      {(upload.problem || failed) && <ErrorNotice problem={upload.problem ?? failed} />}
      <p className={classes.hint}>{t("upload.privacy")}</p>
    </section>
  );
}
