import { Card, Group, Loader, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCloudUpload } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { getMyCompany, type MyCompany } from "../api";
import { useI18n } from "../i18n";

/** An active company's home. Upload and the results arrive in the next steps. */
export function Home() {
  const { t } = useI18n();
  const [company, setCompany] = useState<MyCompany | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMyCompany()
      .then(setCompany)
      .catch(() => setError(true));
  }, []);

  if (error) return <Text c="red">{t("common.error")}</Text>;
  if (!company) return <Loader mx="auto" mt="xl" />;
  return (
    <Stack gap="xl" maw={880} mx="auto" pt="xl">
      <Title order={1} fz={40}>
        {t("home.title", { name: company.name })}
      </Title>
      <Card className="hairline">
        <Group align="flex-start" wrap="nowrap" gap="lg">
          <ThemeIcon size={48} radius="md" variant="light">
            <IconCloudUpload size={26} stroke={1.5} />
          </ThemeIcon>
          <Stack gap={6}>
            <Text fw={600} size="lg">
              {t("home.next.title")}
            </Text>
            <Text c="dimmed">{t("home.next.body")}</Text>
            {company.has_model && <Text size="sm">{t("home.model")}</Text>}
          </Stack>
        </Group>
      </Card>
    </Stack>
  );
}
