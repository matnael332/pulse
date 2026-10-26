import { ActionIcon, Avatar, Button, Group, Menu } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";

import { logout } from "../api";
import { useI18n } from "../i18n";
import { useSession } from "../session";
import { Logo } from "./Logo";
import { Wordmark } from "./Wordmark";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { me, refresh } = useSession();

  async function signOut() {
    await logout();
    await refresh();
  }

  return (
    <Group justify="space-between" h="100%" px="lg">
      <Group gap="sm">
        <Logo size={26} />
        <Wordmark />
      </Group>
      <Group gap="xs">
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          onClick={() => setLang(lang === "he" ? "en" : "he")}
        >
          {t("lang.switch")}
        </Button>
        {me && (
          <Menu position="bottom-end" width={240}>
            <Menu.Target>
              <ActionIcon variant="transparent" radius="xl" size="lg" aria-label={me.user.email}>
                <Avatar size={32} radius="xl" color="gray">
                  {(me.user.name || me.user.email).slice(0, 1).toUpperCase()}
                </Avatar>
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{me.user.email}</Menu.Label>
              <Menu.Item leftSection={<IconLogout size={16} />} onClick={() => void signOut()}>
                {t("common.signOut")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  );
}
