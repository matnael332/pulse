// Choosing, checking and sending the export (the zip itself is the request body, with progress
// and a way to cancel); on success the page moves to the upload's own step.
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import { ApiError, uploadExport, type Problem } from "../api";
import { useI18n } from "../i18n";

const MAX_BYTES = 1 << 30;

export function useUpload() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [local, setLocal] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [abort, setAbort] = useState<(() => void) | null>(null);
  const cancelled = useRef(false);

  function choose(chosen: File | undefined) {
    setProblem(null);
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith(".zip")) {
      setFile(null);
      setLocal(t("upload.notZip"));
    } else if (chosen.size > MAX_BYTES) {
      setFile(null);
      setLocal(t("upload.tooLarge"));
    } else {
      setFile(chosen);
      setLocal("");
    }
  }

  async function send() {
    if (!file) return;
    setProgress(0);
    setProblem(null);
    cancelled.current = false;
    const upload = uploadExport(file, lang, setProgress);
    setAbort(() => upload.abort);
    try {
      const ingestion = await upload.promise;
      navigate(`/data/ingestions/${ingestion.id}`);
    } catch (error) {
      setProgress(null);
      setAbort(null);
      if (!cancelled.current) setProblem(error instanceof ApiError ? error.problem : null);
    }
  }

  function cancel() {
    cancelled.current = true;
    abort?.();
  }

  return { file, local, progress, problem, choose, send, cancel };
}
