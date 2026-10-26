import { BarChart, LineChart } from "@mantine/charts";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Pagination,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type { Results, ScoredAccount } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { download, riskCsv } from "./csv";

const PAGE = 50;
// One signal colour: high risk is red, elevated is plain white (bold), normal is grey.
const LEVEL_COLOR = { high: "red", elevated: "gray.0", normal: "gray" } as const;
type Filter = "all" | ScoredAccount["level"];

function number(value: number, digits = 2): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

/** The business view: who is at risk and why, the trend, what the LLM found, about the data. */
export function BusinessTab({ results }: { results: Results }) {
  const { t, lang, locale } = useI18n();
  const [filter, setFilter] = useState<Filter>("high");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const summary = results.summary;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.accounts.filter(
      (a) =>
        (filter === "all" || a.level === filter) &&
        (!q || a.name.toLowerCase().includes(q) || a.customer_id.includes(q) || a.id.includes(q)),
    );
  }, [results.accounts, filter, query]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const visible = shown.slice((page - 1) * PAGE, page * PAGE);

  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const date = (value?: string | null) =>
    value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "";
  const insights = results.insights;
  const missing = results.groups.missing ?? [];

  function exportCsv() {
    const headers = [
      t("results.rank"),
      t("results.number"),
      t("results.account"),
      t("results.level"),
      `${t("results.probability")} (%)`,
      t("results.reasons"),
    ];
    download(riskCsv(shown, lang, headers), `pulse-risk-${results.run.id}.csv`);
  }

  return (
    <Stack gap="xl">
      {summary && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
          {(
            [
              ["run.accounts", summary.accounts, undefined],
              ["run.high", summary.high, "red"],
              ["run.elevated", summary.elevated, undefined],
              ["run.normal", summary.normal, undefined],
            ] as const
          ).map(([key, count, color]) => (
            <Card key={key} className="hairline">
              <Text size="sm" c="dimmed">
                {t(key)}
              </Text>
              <Text fz={36} fw={600} c={color}>
                {count.toLocaleString(locale)}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {insights.headline && (
        <Card className="hairline">
          <Stack gap="md" dir={insights.language === "he" ? "rtl" : "ltr"}>
            <Title order={3}>{t("results.insights")}</Title>
            <Text size="lg" fw={500}>
              {insights.headline}
            </Text>
            {(insights.key_findings ?? []).length > 0 && (
              <List spacing="sm">
                {insights.key_findings!.map((f) => (
                  <List.Item key={f.title}>
                    <Text span fw={600}>
                      {f.title}.
                    </Text>{" "}
                    {f.evidence} {f.business_meaning}
                  </List.Item>
                ))}
              </List>
            )}
            {(insights.recommendations ?? []).length > 0 && (
              <>
                <Text fw={600}>{t("results.recommendations")}</Text>
                <List spacing="xs">
                  {insights.recommendations!.map((r) => (
                    <List.Item key={r}>{r}</List.Item>
                  ))}
                </List>
              </>
            )}
          </Stack>
          {(insights.source === "template" || insights.language !== lang) && (
            <Text size="sm" c="dimmed" mt="md">
              {insights.source === "template"
                ? t("results.template")
                : insights.language === "he"
                  ? t("results.otherLanguageHe")
                  : t("results.otherLanguage")}
            </Text>
          )}
        </Card>
      )}

      <Card className="hairline" p={0}>
        <Stack gap="md" p="lg">
          <Group justify="space-between">
            <Title order={3}>{t("results.atRisk")}</Title>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={exportCsv}
              size="compact-md"
            >
              {t("results.download")}
            </Button>
          </Group>
          <Group justify="space-between" wrap="wrap">
            <SegmentedControl
              radius="xl"
              value={filter}
              onChange={(value) => {
                setFilter(value as Filter);
                setPage(1);
              }}
              data={[
                { value: "high", label: label.risk("high", lang) },
                { value: "elevated", label: label.risk("elevated", lang) },
                { value: "normal", label: label.risk("normal", lang) },
                { value: "all", label: t("results.all") },
              ]}
            />
            <TextInput
              w={280}
              leftSection={<IconSearch size={16} />}
              placeholder={t("results.search")}
              aria-label={t("results.search")}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setPage(1);
              }}
            />
          </Group>
        </Stack>
        {visible.length === 0 ? (
          <Text c="dimmed" ta="center" p="xl">
            {t("results.empty")}
          </Text>
        ) : (
          <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("results.rank")}</Table.Th>
                <Table.Th>{t("results.account")}</Table.Th>
                <Table.Th>{t("results.level")}</Table.Th>
                <Table.Th>{t("results.probability")}</Table.Th>
                <Table.Th>{t("results.reasons")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td c="dimmed">{a.rank}</Table.Td>
                  <Table.Td>
                    <Text fw={500}>{a.name || a.customer_id || a.id}</Text>
                    {a.name && a.customer_id && (
                      <Text size="xs" c="dimmed">
                        {a.customer_id}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={LEVEL_COLOR[a.level]} tt="none">
                      {label.risk(a.level, lang)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{percent.format(a.probability)}</Table.Td>
                  <Table.Td>
                    {a.reasons.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        {t("results.noReasons")}
                      </Text>
                    ) : (
                      <Group gap={6}>
                        {a.reasons.map((r) => (
                          <Tooltip
                            key={r.feature}
                            label={t("results.reasonTip", {
                              value: number(r.value),
                              typical: number(r.typical),
                            })}
                          >
                            <Badge variant="outline" color="gray" tt="none" radius="sm">
                              {label.reason(r.code, lang)}
                            </Badge>
                          </Tooltip>
                        ))}
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {pages > 1 && (
          <Group justify="center" p="md">
            <Pagination total={pages} value={page} onChange={setPage} />
          </Group>
        )}
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card className="hairline">
          <Title order={4} mb="md">
            {t("results.distribution")}
          </Title>
          <BarChart
            h={240}
            dataKey="level"
            data={(["high", "elevated", "normal"] as const).map((level) => ({
              level: label.risk(level, lang),
              count: results.distribution.levels[level] ?? 0,
            }))}
            series={[{ name: "count", label: t("run.accounts"), color: "gray.0" }]}
            withTooltip
          />
        </Card>
        <Card className="hairline">
          <Title order={4} mb="md">
            {t("results.trend")}
          </Title>
          <LineChart
            h={240}
            dataKey="month"
            data={results.trend.map((p) => ({ month: p.month, rate: (p.rate ?? 0) * 100 }))}
            series={[{ name: "rate", label: t("results.rate"), color: "gray.0" }]}
            valueFormatter={(v) => `${v.toFixed(1)}%`}
            curveType="monotone"
            withDots={false}
          />
        </Card>
      </SimpleGrid>

      <Card className="hairline">
        <Stack gap="sm">
          <Title order={4}>{t("results.dataNotes")}</Title>
          <Text>
            {missing.length
              ? t("results.groupsMissing", {
                  groups: missing.map((g) => label.group(g, lang)).join(", "),
                })
              : t("results.allGroups")}
          </Text>
          {results.data.windows?.train && results.data.windows?.test && (
            <Text c="dimmed">
              {t("results.windows", {
                train: `${date(results.data.windows.train[0])}–${date(results.data.windows.train[1])}`,
                test: `${date(results.data.windows.test[0])}–${date(results.data.windows.test[1])}`,
              })}
            </Text>
          )}
          {results.data.cancellations && (
            <Text c="dimmed">
              {t("results.cancellations", {
                train: String(results.data.cancellations.train),
                test: String(results.data.cancellations.test),
              })}
            </Text>
          )}
          {results.data.low_confidence && (
            <Alert color="gray" variant="light">
              {t("results.lowConfidence")}
            </Alert>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
