// The signed-in frame: one bar across the top (the mark, the two pages, the company, the language
// and the account) and the page under it. The current page is white, the other grey; an operator
// has only the companies screen.
import { ActionIcon, AppShell, Avatar, Button, Container, Group, Menu } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { NavLink, Outlet } from "react-router";

import { logout } from "../api";
import { Logo } from "../components/Logo";
import { Wordmark } from "../components/Wordmark";
import { useI18n } from "../i18n";
import { useSession } from "../session";
import classes from "./Shell.module.css";

export function Shell() {
  const { t, lang, setLang } = useI18n();
  const { me, refresh } = useSession();

  async function signOut() {
    await logout();
    await refresh();
  }

  const link = ({ isActive }: { isActive: boolean }) =>
    `${classes.link} ${isActive ? classes.on : ""}`;

  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header className={classes.bar}>
        <Group gap="sm" wrap="nowrap">
          <Logo size={26} />
          <Wordmark />
        </Group>
        <nav className={classes.nav}>
          {me?.state === "operator" ? (
            <NavLink to="/operator" className={link}>
              {t("operator.title")}
            </NavLink>
          ) : (
            <>
              <NavLink to="/data" className={link}>
                {t("nav.data")}
              </NavLink>
              {me?.state === "active" && (
                <NavLink to="/dashboard" className={link}>
                  {t("nav.dashboard")}
                </NavLink>
              )}
            </>
          )}
        </nav>
        <Group gap="md" wrap="nowrap" justify="flex-end">
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            onClick={() => setLang(lang === "he" ? "en" : "he")}
          >
            {t("lang.switch")}
          </Button>
          {me?.company && <span className={classes.company}>{me.company.name}</span>}
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
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
