import { BarChart } from "@mantine/charts";
import {
  Anchor,
  Badge,
  Card,
  Group,
  Image,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Typography,
} from "@mantine/core";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";

import { figureUrl, getAdvanced, getDoc, listRuns, type Advanced, type RunInfo } from "../api";
import { type Key, useI18n } from "../i18n";

const METRICS = [
  "roc_auc",
  "pr_auc",
  "precision_at_top10pct",
  "lift_at_top10pct",
  "brier",
] as const;

/** The reports carry a few HTML notes (provenance in <sub>); markdown here renders no HTML. */
function withoutHtml(markdown: string): string {
  return markdown.replace(/<sub>[\s\S]*?<\/sub>/g, "");
}

function show(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(3);
}

/** The advanced view: how good the model is, what drives it, the reports, the runs. */
export function AdvancedTab({ runId }: { runId: string }) {
  const { t, locale } = useI18n();
  const [advanced, setAdvanced] = useState<Advanced | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [doc, setDoc] = useState<string>("model_card");
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    void getAdvanced(runId).then(setAdvanced);
    void listRuns().then((answer) => setRuns(answer.runs));
  }, [runId]);
  useEffect(() => {
    setText(null);
    void getDoc(runId, doc)
      .then(setText)
      .catch(() => setText(""));
  }, [runId, doc]);

  if (!advanced) return <Loader mx="auto" mt="xl" />;
  const selected = advanced.selected_model ? advanced.candidates[advanced.selected_model] : null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Stack gap="xl">
      {selected && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={3}>{t("advanced.metrics")}</Title>
            {advanced.threshold !== null && (
              <Text c="dimmed" size="sm">
                {t("advanced.threshold", { value: advanced.threshold.toFixed(3) })}
              </Text>
            )}
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
            {METRICS.map((metric) => (
              <Card key={metric} className="hairline" padding="lg">
                <Text size="sm" c="dimmed">
                  {t(`advanced.${metric}` as Key)}
                </Text>
                <Text fz={28} fw={600}>
                  {show(selected.test[metric])}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      )}

      <Card className="hairline" p={0}>
        <Title order={4} p="lg" pb={0}>
          {t("advanced.candidates")}
        </Title>
        <Table verticalSpacing="sm" horizontalSpacing="lg" mt="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("advanced.model")}</Table.Th>
              {METRICS.map((m) => (
                <Table.Th key={m}>{t(`advanced.${m}` as Key)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.entries(advanced.candidates).map(([name, candidate]) => (
              <Table.Tr key={name}>
                <Table.Td dir="ltr">
                  <Group gap="xs">
                    <Text ff="monospace" size="sm">
                      {name}
                    </Text>
                    {name === advanced.selected_model && (
                      <Badge size="sm" variant="light">
                        {t("advanced.selected")}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                {METRICS.map((m) => (
                  <Table.Td key={m}>{show(candidate.test[m])}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      {advanced.importance.length > 0 && (
        <Card className="hairline">
          <Title order={4} mb="md">
            {t("advanced.importance")}
          </Title>
          <div dir="ltr">
            <BarChart
              h={Math.max(200, advanced.importance.length * 28)}
              dataKey="feature"
              orientation="vertical"
              yAxisProps={{ width: 220 }}
              data={advanced.importance.map((f) => ({
                feature: f.feature,
                importance: f.importance_mean,
              }))}
              series={[{ name: "importance", color: "gray.0" }]}
              valueFormatter={(v) => v.toFixed(3)}
            />
          </div>
        </Card>
      )}

      {advanced.docs.length > 0 && (
        <Card className="hairline">
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={4}>{t("advanced.docs")}</Title>
              <SegmentedControl
                radius="xl"
                value={doc}
                onChange={setDoc}
                data={advanced.docs.map((d) => ({ value: d, label: t(`advanced.${d}` as Key) }))}
              />
            </Group>
            <Text size="sm" c="dimmed">
              {t("advanced.englishOnly")}
            </Text>
            {text === null ? (
              <Loader size="sm" />
            ) : (
              <Typography dir="ltr" data-testid="report">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{withoutHtml(text)}</ReactMarkdown>
              </Typography>
            )}
          </Stack>
        </Card>
      )}

      {advanced.figures.length > 0 && (
        <Stack gap="sm">
          <Title order={4}>{t("advanced.figures")}</Title>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            {advanced.figures.map((name) => (
              <Card key={name} className="hairline" padding="md">
                <Image src={figureUrl(runId, name)} alt={name} radius="md" />
                <Text size="xs" c="dimmed" mt="xs" dir="ltr">
                  {name}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      )}

      {runs.length > 0 && (
        <Card className="hairline">
          <Title order={4} mb="sm">
            {t("advanced.history")}
          </Title>
          <Stack gap={6}>
            {runs.map((run) => (
              <Group key={run.id} justify="space-between">
                <Anchor component={Link} to={`/runs/${run.id}`}>
                  {date.format(new Date(run.created_at))}
                </Anchor>
                <Group gap="xs">
                  {run.demo && <Badge variant="light">{t("common.demo")}</Badge>}
                  <Text size="sm" c="dimmed">
                    {run.summary
                      ? t("home.accounts", { count: String(run.summary.accounts) })
                      : run.status}
                  </Text>
                </Group>
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
