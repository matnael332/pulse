import { Alert, Button, Card, Group, Progress, Stack, Text, Title } from "@mantine/core";
import { IconFileZip, IconLock } from "@tabler/icons-react";
import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";

import { ApiError, uploadExport, type Problem } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { Journey } from "../components/Journey";
import { useI18n } from "../i18n";

const MAX_BYTES = 1 << 30;

/** Choose or drop a zip, send it with a progress bar; then on to the ingestion's page. */
export function Upload() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
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
      navigate(`/ingestions/${ingestion.id}`);
    } catch (error) {
      setProgress(null);
      setAbort(null);
      if (!cancelled.current) setProblem(error instanceof ApiError ? error.problem : null);
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    choose(event.dataTransfer.files[0]);
  }

  return (
    <Stack gap="xl" maw={720} mx="auto" pt="xl">
      <Journey at="upload" />
      <Stack gap="xs">
        <Title order={1} fz={36}>
          {t("upload.title")}
        </Title>
        <Text c="dimmed" size="lg">
          {t("upload.lead")}
        </Text>
      </Stack>
      <Card
        className="hairline"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
        data-testid="dropzone"
      >
        <Stack align="center" gap="md" py="lg">
          <IconFileZip size={48} stroke={1.2} />
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            hidden
            aria-label={t("upload.choose")}
            onChange={(event) => choose(event.currentTarget.files?.[0])}
          />
          {file ? (
            <Text fw={500}>
              {file.name} · {(file.size / (1 << 20)).toFixed(1)} MB
            </Text>
          ) : (
            <Text c="dimmed">{t("upload.drop")}</Text>
          )}
          {progress === null ? (
            <Group>
              <Button variant="default" onClick={() => input.current?.click()}>
                {t("upload.choose")}
              </Button>
              <Button disabled={!file} onClick={() => void send()}>
                {t("upload.send")}
              </Button>
            </Group>
          ) : (
            <Stack w="100%" gap="xs">
              <Progress value={progress * 100} size="lg" radius="xl" animated />
              <Group justify="center">
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    cancelled.current = true;
                    abort?.();
                  }}
                >
                  {t("upload.cancel")}
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      </Card>
      {local && (
        <Alert color="red" variant="light">
          {local}
        </Alert>
      )}
      {problem && <ErrorNotice problem={problem} />}
      <Group gap="xs" c="dimmed" wrap="nowrap">
        <IconLock size={16} />
        <Text size="sm">{t("upload.privacy")}</Text>
      </Group>
    </Stack>
  );
}
