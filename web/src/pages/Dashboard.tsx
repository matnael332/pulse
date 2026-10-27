// The dashboard: for now a finished run's results as they were (6d redesigns it). /dashboard opens
// the latest one, or the data page when there is none yet.
import { Badge, Group, Loader, Stack, Title } from "@mantine/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";

import { getMyCompany, getRun, type RunInfo } from "../api";
import { useI18n } from "../i18n";

const Results = lazy(() => import("../results/Results"));

export function Dashboard() {
  const { runId } = useParams();
  const { t } = useI18n();
  const [latest, setLatest] = useState<string | null>(null);
  const [run, setRun] = useState<RunInfo | null>(null);

  useEffect(() => {
    if (runId) {
      void getRun(runId).then(setRun);
    } else {
      getMyCompany()
        .then((company) => setLatest(company.latest_run ? company.latest_run.id : ""))
        .catch(() => setLatest(""));
    }
  }, [runId]);

  if (!runId) {
    if (latest === null) return <Loader mx="auto" mt="xl" />;
    return <Navigate to={latest ? `/dashboard/${latest}` : "/data"} replace />;
  }
  if (run && run.status !== "succeeded") return <Navigate to={`/data/runs/${run.id}`} replace />;

  return (
    <Stack gap="xl" pt="xl">
      <Group gap="sm">
        <Title order={1} fz={32}>
          {t("nav.dashboard")}
        </Title>
        {run?.demo && (
          <Badge variant="light" size="lg">
            {t("common.demo")}
          </Badge>
        )}
      </Group>
      <Suspense fallback={<Loader mx="auto" mt="xl" />}>
        <Results runId={runId} />
      </Suspense>
    </Stack>
  );
}
