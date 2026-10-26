import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconCloudUpload, IconFlask, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { ApiError, getMyCompany, tryDemo, type MyCompany } from "../api";
import { ErrorNotice } from "../components/ErrorNotice";
import { useI18n } from "../i18n";

/** An active company's home: upload (or try the demo), what is under way, the latest result. */
export function Home() {
  const { t, lang, locale } = useI18n();
  const navigate = useNavigate();
  const [company, setCompany] = useState<MyCompany | null>(null);
  const [failed, setFailed] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMyCompany()
      .then(setCompany)
      .catch((error) => setFailed(error instanceof ApiError ? error : new ApiError(0, "")));
  }, []);

  async function demo() {
    setBusy(true);
    try {
      const ingestion = await tryDemo(lang);
      navigate(`/ingestions/${ingestion.id}`);
    } catch (error) {
      setFailed(error instanceof ApiError ? error : new ApiError(0, ""));
      setBusy(false);
    }
  }

  if (!company && !failed) return <Loader mx="auto" mt="xl" />;
  const current = company?.current;
  const latest = company?.latest_run;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <Stack gap="xl" maw={880} mx="auto" pt="xl">
      <Title order={1} fz={40}>
        {company?.name}
      </Title>
      {failed && <ErrorNotice problem={failed.problem} />}
      {current && (
        <Alert variant="light" radius="lg" icon={<IconRefresh size={20} />}>
          <Group justify="space-between">
            <Text fw={500}>{t("home.current")}</Text>
            <Button
              component={Link}
              to={current.kind === "run" ? `/runs/${current.id}` : `/ingestions/${current.id}`}
              size="compact-md"
              variant="light"
            >
              {t("home.currentOpen")}
            </Button>
          </Group>
        </Alert>
      )}
      {latest?.summary && (
        <Card className="hairline">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Group gap="xs">
                <Text fw={600} size="lg">
                  {t("home.latest")}
                </Text>
                {latest.demo && <Badge variant="light">{t("common.demo")}</Badge>}
              </Group>
              <Text c="dimmed">
                {t("home.accounts", { count: String(latest.summary.accounts) })} ·{" "}
                {t("home.atRisk", { count: String(latest.summary.high) })}
                {latest.finished_at && ` · ${date.format(new Date(latest.finished_at))}`}
              </Text>
            </Stack>
            <Button component={Link} to={`/runs/${latest.id}`}>
              {t("home.latestOpen")}
            </Button>
          </Group>
        </Card>
      )}
      <SimpleGrid cols={{ base: 1, sm: company?.has_real_data ? 1 : 2 }} spacing="lg">
        <Card className="hairline">
          <Stack gap="md" h="100%" justify="space-between">
            <Group align="flex-start" wrap="nowrap" gap="lg">
              <ThemeIcon size={48} radius="md" variant="light">
                <IconCloudUpload size={26} stroke={1.5} />
              </ThemeIcon>
              <Stack gap={6}>
                <Text fw={600} size="lg">
                  {t("home.upload")}
                </Text>
                <Text c="dimmed">{t("upload.lead")}</Text>
              </Stack>
            </Group>
            <Button component={Link} to="/upload" disabled={Boolean(current)}>
              {t("home.upload")}
            </Button>
          </Stack>
        </Card>
        {!company?.has_real_data && (
          <Card className="hairline">
            <Stack gap="md" h="100%" justify="space-between">
              <Group align="flex-start" wrap="nowrap" gap="lg">
                <ThemeIcon size={48} radius="md" variant="light" color="grape">
                  <IconFlask size={26} stroke={1.5} />
                </ThemeIcon>
                <Stack gap={6}>
                  <Text fw={600} size="lg">
                    {t("home.demo")}
                  </Text>
                  <Text c="dimmed">{t("home.demoHint")}</Text>
                </Stack>
              </Group>
              <Button
                variant="default"
                loading={busy}
                disabled={Boolean(current)}
                onClick={() => void demo()}
              >
                {t("home.demo")}
              </Button>
            </Stack>
          </Card>
        )}
      </SimpleGrid>
    </Stack>
  );
}
