import { Button, Card, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";

import {
  approveIngestion,
  discardIngestion,
  getIngestion,
  getReview,
  type Ingestion,
  type Review,
} from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { Journey } from "../components/Journey";
import { MappingReview } from "../components/MappingReview";
import { useI18n } from "../i18n";
import { usePoll } from "../poll";

const WORKING = ["proposing", "applying"];

/** One upload: being read, waiting for the customer's review, being prepared, or refused. */
export function IngestionPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const {
    value: ingestion,
    setValue,
    reload,
  } = usePoll<Ingestion>(
    () => getIngestion(id),
    (i) => WORKING.includes(i.status),
    id,
  );
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    if (ingestion?.status === "proposed" && !review) void getReview(id).then(setReview);
  }, [id, ingestion?.status, review]);

  if (!ingestion) return <Loader mx="auto" mt="xl" />;
  if (ingestion.status === "applied" && ingestion.run_id) {
    return <Navigate to={`/runs/${ingestion.run_id}`} replace />;
  }

  return (
    <Stack gap="xl" maw={920} mx="auto" pt="xl">
      <Journey
        at={
          ingestion.status === "proposing"
            ? "read"
            : ingestion.status === "proposed"
              ? "review"
              : "prepare"
        }
        failed={ingestion.status === "failed"}
      />
      {WORKING.includes(ingestion.status) && (
        <Card className="hairline">
          <Group gap="md" wrap="nowrap">
            <Loader size="sm" />
            <Stack gap={2}>
              <Text fw={500}>
                {ingestion.status === "proposing"
                  ? t("ingestion.reading")
                  : t("ingestion.preparing")}
              </Text>
              {ingestion.queue_position > 0 && (
                <Text size="sm" c="dimmed">
                  {t("queue.waiting", { count: String(ingestion.queue_position) })}
                </Text>
              )}
            </Stack>
          </Group>
        </Card>
      )}
      {ingestion.status === "proposed" && review && (
        <MappingReview
          ingestionId={id}
          review={review}
          onChange={setReview}
          onApprove={async () => {
            setValue(await approveIngestion(id));
            reload();
          }}
          onDiscard={async () => setValue(await discardIngestion(id))}
        />
      )}
      {ingestion.status === "failed" && (
        <Stack gap="md">
          <Title order={2}>{t("ingestion.failed")}</Title>
          <ErrorNotice problem={ingestion.error} />
          <Group>
            <Button component={Link} to="/upload">
              {t("ingestion.another")}
            </Button>
            <Button component={Link} to="/" variant="default">
              {t("common.back")}
            </Button>
          </Group>
        </Stack>
      )}
      {ingestion.status === "discarded" && (
        <Stack gap="md">
          <Text>{t("ingestion.discarded")}</Text>
          <Group>
            <Button component={Link} to="/">
              {t("common.back")}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
