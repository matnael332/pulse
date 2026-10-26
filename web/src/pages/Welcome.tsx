import { Alert, Button, Card, Center, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState, type FormEvent } from "react";

import { signupCompany } from "../api";
import { useI18n } from "../i18n";
import { useSession } from "../session";

export function Welcome() {
  const { t } = useI18n();
  const { refresh } = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tooShort = name.trim().length < 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort) return;
    setBusy(true);
    try {
      await signupCompany(name.trim());
      await refresh();
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Center mih="70vh">
      <Stack w="100%" maw={460} gap="xl">
        <Stack gap="xs" ta="center">
          <Title order={1} fz={36}>
            {t("welcome.title")}
          </Title>
          <Text c="dimmed" size="lg">
            {t("welcome.lead")}
          </Text>
        </Stack>
        <Card className="hairline">
          <form onSubmit={submit}>
            <Stack gap="md">
              {error && (
                <Alert color="red" variant="light" radius="md">
                  {error}
                </Alert>
              )}
              <TextInput
                label={t("welcome.name")}
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.currentTarget.value)}
                error={name && tooShort ? t("welcome.tooShort") : undefined}
                data-autofocus
              />
              <Button type="submit" loading={busy} disabled={tooShort} fullWidth>
                {t("welcome.submit")}
              </Button>
            </Stack>
          </form>
        </Card>
      </Stack>
    </Center>
  );
}
