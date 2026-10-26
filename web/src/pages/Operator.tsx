import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  decide,
  listCompanies,
  type Action,
  type CompanyRow,
  type CompanyStatus,
} from "../api";
import { useI18n } from "../i18n";

const STATUSES: CompanyStatus[] = ["pending", "active", "rejected", "suspended"];
const ACTIONS: Record<CompanyStatus, Action[]> = {
  pending: ["approve", "reject"],
  active: ["suspend"],
  rejected: [],
  suspended: ["reactivate"],
};

/** The operator's minimal screen: companies by status, and the decisions on them. */
export function Operator() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<CompanyStatus>("pending");
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ row: CompanyRow; action: Action } | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows((await listCompanies(status)).companies);
      setError("");
    } catch {
      setError(t("common.error"));
      setRows([]);
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <Stack gap="xl" maw={1080} mx="auto" pt="xl">
      <Group justify="space-between" align="flex-end">
        <Title order={1} fz={40}>
          {t("operator.title")}
        </Title>
        <SegmentedControl
          radius="xl"
          value={status}
          onChange={(value) => setStatus(value as CompanyStatus)}
          data={STATUSES.map((value) => ({ value, label: t(`operator.${value}`) }))}
        />
      </Group>
      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
      <Card className="hairline" p={0}>
        {rows === null ? (
          <Loader m="xl" mx="auto" />
        ) : rows.length === 0 ? (
          <Text c="dimmed" ta="center" p="xl">
            {t("operator.empty")}
          </Text>
        ) : (
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("operator.name")}</Table.Th>
                <Table.Th>{t("operator.user")}</Table.Th>
                <Table.Th>{t("operator.created")}</Table.Th>
                <Table.Th>{t("operator.folder")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td fw={500}>{row.name}</Table.Td>
                  <Table.Td>
                    <span dir="ltr">{row.user_email}</span>
                  </Table.Td>
                  <Table.Td>{date.format(new Date(row.created_at))}</Table.Td>
                  <Table.Td>
                    {row.slug ? (
                      <Badge variant="light" color="gray" tt="none" dir="ltr">
                        {row.slug}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      {ACTIONS[row.status].map((action) => (
                        <Button
                          key={action}
                          size="compact-sm"
                          variant={
                            action === "approve" || action === "reactivate" ? "filled" : "default"
                          }
                          onClick={() => setOpen({ row, action })}
                        >
                          {t(`operator.${action}`)}
                        </Button>
                      ))}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
      {open && (
        <DecisionModal
          row={open.row}
          action={open.action}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
    </Stack>
  );
}

function DecisionModal({
  row,
  action,
  onClose,
  onDone,
}: {
  row: CompanyRow;
  action: Action;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [slug, setSlug] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const body: { slug?: string; note?: string } = {};
      if (action === "approve" && slug.trim()) body.slug = slug.trim();
      if (action !== "approve" && note.trim()) body.note = note.trim();
      await decide(row.id, action, body);
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={t(`operator.${action}Title`, { name: row.name })}>
      <Stack gap="md">
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {action === "approve" ? (
          <TextInput
            label={t("operator.slug")}
            description={t("operator.slugHint")}
            dir="ltr"
            value={slug}
            onChange={(event) => setSlug(event.currentTarget.value)}
          />
        ) : action !== "reactivate" ? (
          <Textarea
            label={t("operator.note")}
            autosize
            minRows={2}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            color={action === "reject" || action === "suspend" ? "red" : undefined}
            loading={busy}
            onClick={() => void confirm()}
          >
            {t("operator.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
