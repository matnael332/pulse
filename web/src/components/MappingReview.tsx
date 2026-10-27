import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useState } from "react";

import { ApiError, fixMapping, type Fixes, type Problem, type Review } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { ErrorNotice } from "./ErrorNotice";

/** The proposal, for the customer: what we understood, and the only things they may fix. */
export function MappingReview({
  ingestionId,
  review,
  onChange,
  onApprove,
  onDiscard,
}: {
  ingestionId: string;
  review: Review;
  onChange: (review: Review) => void;
  onApprove: () => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const { t, lang, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const NONE = "\u0000none"; // the "no such column" / "keep as written" choice

  async function fix(fixes: Fixes) {
    setProblem(null);
    try {
      onChange(await fixMapping(ingestionId, fixes));
    } catch (error) {
      setProblem(error instanceof ApiError ? error.problem : null);
    }
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof ApiError ? error.problem : null);
      setBusy(false);
    }
  }

  const blocking = review.blocking
    .map((c) => `${label.table(c.table, lang)} · ${label.column(c.column, lang)}`)
    .join(", ");
  const ignored = Object.entries(review.ignored);

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={2} fz={26}>
          {t("review.title")}
        </Title>
        <Text c="dimmed" size="lg">
          {t("review.lead")}
        </Text>
      </Stack>

      <Card className="hairline">
        <Stack gap="sm">
          <Text fw={600}>{t("review.groups")}</Text>
          <Group gap="xs">
            {review.groups.present.map((g) => (
              <Badge key={g} variant="light" color="gray" tt="none" size="lg">
                {label.group(g, lang)}
              </Badge>
            ))}
            {review.groups.missing.map((g) => (
              <Badge key={g} variant="outline" color="gray" tt="none" size="lg">
                {t("review.missing")}: {label.group(g, lang)}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Card>

      <Card className="hairline">
        <Stack gap="md">
          <Text fw={600}>{t("review.flagged")}</Text>
          {review.columns.length === 0 && review.values.length === 0 && (
            <Text c="dimmed">{t("review.flaggedNone")}</Text>
          )}
          {review.columns.map((item) => (
            <Group key={`${item.table}.${item.column}`} justify="space-between" wrap="nowrap">
              <Stack gap={2}>
                <Group gap="xs">
                  <Text fw={500}>{label.column(item.column, lang)}</Text>
                  <Badge
                    size="sm"
                    variant="light"
                    color={item.reason === "missing" ? "red" : "gray"}
                    tt="none"
                  >
                    {item.reason === "missing" ? t("review.missingColumn") : t("review.uncertain")}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {label.table(item.table, lang)}
                  {item.time_column && ` · ${t("review.withTime", { column: item.time_column })}`}
                </Text>
              </Stack>
              <Select
                w={260}
                aria-label={label.column(item.column, lang)}
                value={item.current ?? NONE}
                allowDeselect={false}
                data={[
                  ...item.options.map((o) => ({ value: o.name, label: o.name })),
                  ...(item.required ? [] : [{ value: NONE, label: t("review.noSource") }]),
                ]}
                onChange={(value) =>
                  void fix({
                    columns: [
                      {
                        table: item.table,
                        column: item.column,
                        source: value === NONE ? null : value,
                      },
                    ],
                  })
                }
              />
            </Group>
          ))}
          {review.values.map((item) => (
            <Stack key={`${item.table}.${item.column}`} gap="xs">
              <Text fw={500}>
                {t("review.values")}: {label.column(item.column, lang)} (
                {label.table(item.table, lang)})
              </Text>
              {item.spellings.map((s) => (
                <Group key={s.spelling} justify="space-between" wrap="nowrap">
                  <Text>{s.spelling}</Text>
                  <Select
                    w={260}
                    aria-label={s.spelling}
                    value={s.value ?? NONE}
                    allowDeselect={false}
                    data={[
                      ...item.allowed.map((v) => ({ value: v, label: label.value(v, lang) })),
                      { value: NONE, label: t("review.keep") },
                    ]}
                    onChange={(value) =>
                      void fix({
                        values: [
                          {
                            table: item.table,
                            column: item.column,
                            spelling: s.spelling,
                            value: value === NONE ? null : value,
                          },
                        ],
                      })
                    }
                  />
                </Group>
              ))}
            </Stack>
          ))}
        </Stack>
      </Card>

      <Card className="hairline" p={0}>
        <Table verticalSpacing="sm" horizontalSpacing="lg">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("review.table")}</Table.Th>
              <Table.Th>{t("review.source")}</Table.Th>
              <Table.Th ta="end">{t("review.rows")}</Table.Th>
              <Table.Th ta="end">{t("review.columns")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {review.tables.map((row) => (
              <Table.Tr key={row.target}>
                <Table.Td fw={500}>{label.table(row.target, lang)}</Table.Td>
                <Table.Td>{row.sources.join(", ")}</Table.Td>
                <Table.Td ta="end" className="figures">
                  {row.rows.toLocaleString(locale)}
                </Table.Td>
                <Table.Td ta="end" className="figures">
                  {row.mapped}/{row.total}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Accordion variant="separated" radius="lg">
        {ignored.length > 0 && (
          <Accordion.Item value="ignored">
            <Accordion.Control>
              {t("review.ignored")}
              <Text size="sm" c="dimmed">
                {t("review.ignoredHint")}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <List size="sm" spacing={4}>
                {ignored.map(([source, columns]) => (
                  <List.Item key={source}>
                    <Text span fw={500}>
                      {source}:
                    </Text>{" "}
                    {columns.join(", ")}
                  </List.Item>
                ))}
              </List>
            </Accordion.Panel>
          </Accordion.Item>
        )}
        {review.notes.length > 0 && (
          <Accordion.Item value="notes">
            <Accordion.Control>{t("review.notes")}</Accordion.Control>
            <Accordion.Panel>
              <List size="sm" spacing={4} dir="ltr">
                {review.notes.map((note) => (
                  <List.Item key={note}>{note}</List.Item>
                ))}
              </List>
            </Accordion.Panel>
          </Accordion.Item>
        )}
      </Accordion>

      {blocking && (
        <Alert color="red" variant="light">
          {t("review.blocking", { columns: blocking })}
        </Alert>
      )}
      {problem && <ErrorNotice problem={problem} />}
      <Group justify="flex-end">
        <Button variant="default" disabled={busy} onClick={() => void act(onDiscard)}>
          {t("review.discard")}
        </Button>
        <Button loading={busy} disabled={Boolean(blocking)} onClick={() => void act(onApprove)}>
          {t("review.approve")}
        </Button>
      </Group>
    </Stack>
  );
}
