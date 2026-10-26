// The results screen of a finished run (its own bundle: charts and markdown load only here).
import "@mantine/charts/styles.css";

import { Loader, Tabs } from "@mantine/core";
import { IconChartBar, IconFlask2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { ApiError, getResults, type Problem, type Results as ResultsData } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { useI18n } from "../i18n";
import { AdvancedTab } from "./AdvancedTab";
import { BusinessTab } from "./BusinessTab";

export default function Results({ runId }: { runId: string }) {
  const { t } = useI18n();
  const [results, setResults] = useState<ResultsData | null>(null);
  const [problem, setProblem] = useState<Problem | null | undefined>(undefined);

  useEffect(() => {
    getResults(runId)
      .then(setResults)
      .catch((error) => setProblem(error instanceof ApiError ? error.problem : null));
  }, [runId]);

  if (problem !== undefined) return <ErrorNotice problem={problem} />;
  if (!results) return <Loader mx="auto" mt="xl" />;
  return (
    <Tabs defaultValue="business" variant="pills" radius="xl" keepMounted={false}>
      <Tabs.List mb="xl">
        <Tabs.Tab value="business" leftSection={<IconChartBar size={16} />}>
          {t("results.business")}
        </Tabs.Tab>
        <Tabs.Tab value="advanced" leftSection={<IconFlask2 size={16} />}>
          {t("results.advanced")}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="business">
        <BusinessTab results={results} />
      </Tabs.Panel>
      <Tabs.Panel value="advanced">
        <AdvancedTab runId={runId} />
      </Tabs.Panel>
    </Tabs>
  );
}
