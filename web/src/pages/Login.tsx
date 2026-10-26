import { Alert, Button, Card, Center, Divider, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconBrandGoogleFilled, IconBrandWindows } from "@tabler/icons-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { devLogin, getProviders } from "../api";
import { Logo } from "../components/Logo";
import { useI18n } from "../i18n";
import { useSession } from "../session";

export function Login() {
  const { t } = useI18n();
  const { refresh } = useSession();
  const [params] = useSearchParams();
  const [providers, setProviders] = useState<string[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(params.get("error") ? t("login.failed") : "");

  useEffect(() => {
    getProviders()
      .then((answer) => setProviders(answer.providers))
      .catch(() => setProviders([]));
  }, []);

  async function submitDev(event: FormEvent) {
    event.preventDefault();
    try {
      await devLogin(email);
      await refresh();
    } catch {
      setError(t("login.failed"));
    }
  }

  const has = (name: string) => providers?.includes(name) ?? false;

  return (
    <Center mih="70vh">
      <Stack w="100%" maw={420} gap="xl" align="stretch">
        <Stack gap="sm" align="center" ta="center">
          <Logo size={56} />
          <Title order={1} fz={40}>
            {t("app.name")}
          </Title>
          <Text c="dimmed" size="lg">
            {t("app.tagline")}
          </Text>
        </Stack>
        <Card className="hairline">
          <Stack gap="md">
            {error && (
              <Alert color="red" variant="light" radius="md">
                {error}
              </Alert>
            )}
            {has("google") && (
              <Button
                component="a"
                href="/auth/google/login"
                variant="default"
                leftSection={<IconBrandGoogleFilled size={18} />}
                fullWidth
              >
                {t("login.google")}
              </Button>
            )}
            {has("microsoft") && (
              <Button
                component="a"
                href="/auth/microsoft/login"
                variant="default"
                leftSection={<IconBrandWindows size={18} />}
                fullWidth
              >
                {t("login.microsoft")}
              </Button>
            )}
            {has("dev") && (
              <form onSubmit={submitDev}>
                <Stack gap="sm">
                  {(has("google") || has("microsoft")) && <Divider label={t("login.dev")} />}
                  <TextInput
                    type="email"
                    required
                    label={has("google") || has("microsoft") ? undefined : t("login.dev")}
                    placeholder={t("login.devEmail")}
                    aria-label={t("login.devEmail")}
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                  />
                  <Button type="submit" fullWidth>
                    {t("login.devSubmit")}
                  </Button>
                </Stack>
              </form>
            )}
            {providers !== null && providers.length === 0 && (
              <Text c="dimmed" ta="center">
                {t("login.none")}
              </Text>
            )}
          </Stack>
        </Card>
        <Text c="dimmed" size="sm" ta="center">
          {t("login.footer")}
        </Text>
      </Stack>
    </Center>
  );
}
