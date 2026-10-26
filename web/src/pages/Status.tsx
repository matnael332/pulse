import { Center, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconHourglassHigh, IconLock, IconMoodSad } from "@tabler/icons-react";

import type { CompanyStatus } from "../api";
import { useI18n } from "../i18n";
import { useSession } from "../session";

const LOOK = {
  pending: { icon: IconHourglassHigh, color: "accent" },
  rejected: { icon: IconMoodSad, color: "gray" },
  suspended: { icon: IconLock, color: "orange" },
} as const;

/** Where a company that cannot use the product yet stands: pending, rejected or suspended. */
export function Status() {
  const { t } = useI18n();
  const { me } = useSession();
  const company = me?.company;
  if (!company || company.status === "active") return null;
  const status = company.status as Exclude<CompanyStatus, "active">;
  const { icon: Icon, color } = LOOK[status];
  return (
    <Center mih="70vh">
      <Stack maw={520} gap="lg" align="center" ta="center">
        <ThemeIcon size={72} radius="xl" variant="light" color={color}>
          <Icon size={36} stroke={1.5} />
        </ThemeIcon>
        <Title order={1} fz={34}>
          {t(`status.${status}.title`)}
        </Title>
        <Text c="dimmed" size="lg">
          {t(`status.${status}.body`, { name: company.name })}
        </Text>
        {status !== "pending" && company.note && (
          <Text size="md">{t("status.reason", { note: company.note })}</Text>
        )}
      </Stack>
    </Center>
  );
}
