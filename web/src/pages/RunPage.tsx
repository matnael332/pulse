import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ApiError, getRun, retryRun, type Problem, type RunInfo } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { Journey } from "../components/Journey";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { usePoll } from "../poll";

/** A run: its progress through the pipeline's stages, then its summary or why it failed. */
export function RunPage() {
  const { id = "" } = useParams();
  const { t, lang, locale } = useI18n();
  const navigate = useNavigate();
  const { value: run } = usePoll<RunInfo>(
    () => getRun(id),
    (r) => r.status === "queued" || r.status === "running",
    id,
  );
  const [problem, setProblem] = useState<Problem | null>(null);

  async function retry() {
    try {
      const again = await retryRun(id);
      navigate(`/runs/${again.id}`);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.problem : null);
    }
  }

  if (!run) return <Loader mx="auto" mt="xl" />;
  const working = run.status === "queued" || run.status === "running";

  return (
    <Stack gap="xl" maw={920} mx="auto" pt="xl">
      {working && <Journey at="run" />}
      <Group gap="sm">
        <Title order={1} fz={36}>
          {working ? t("run.title") : run.status === "succeeded" ? t("run.done") : t("run.failed")}
        </Title>
        {run.demo && (
          <Badge variant="light" size="lg">
            {t("common.demo")}
          </Badge>
        )}
      </Group>
      {working && (
        <Card className="hairline">
          <Stack gap="sm">
            <Text fw={500}>
              {t("run.stage", {
                done: String(Math.min(run.stages_done + 1, run.stages)),
                total: String(run.stages),
                stage: label.stage(run.stage ?? "prepare_run", lang),
              })}
            </Text>
            <Progress value={(run.stages_done / run.stages) * 100} size="lg" radius="xl" animated />
            {run.queue_position > 0 && (
              <Text size="sm" c="dimmed">
                {t("queue.waiting", { count: String(run.queue_position) })}
              </Text>
            )}
          </Stack>
        </Card>
      )}
      {run.status === "succeeded" && run.summary && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
            {(
              [
                ["run.accounts", run.summary.accounts, undefined],
                ["run.high", run.summary.high, "red"],
                ["run.elevated", run.summary.elevated, "orange"],
                ["run.normal", run.summary.normal, undefined],
              ] as const
            ).map(([key, count, color]) => (
              <Card key={key} className="hairline">
                <Text size="sm" c="dimmed">
                  {t(key)}
                </Text>
                <Text fz={36} fw={600} c={color}>
                  {count.toLocaleString()}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
          {run.summary.snapshot_date && (
            <Text c="dimmed">
              {t("run.snapshot", {
                date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
                  new Date(run.summary.snapshot_date),
                ),
              })}
            </Text>
          )}
          <Text c="dimmed">{t("run.resultsSoon")}</Text>
        </>
      )}
      {run.status === "failed" && (
        <Stack gap="md">
          <ErrorNotice problem={run.error} />
          {problem && <ErrorNotice problem={problem} />}
          <Group>
            <Button onClick={() => void retry()}>{t("common.retry")}</Button>
            <Button component={Link} to="/" variant="default">
              {t("common.back")}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
