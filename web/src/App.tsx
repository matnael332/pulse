// The site: one page per state of the signed-in user, chosen by the gate from /api/me.
import { AppShell, Button, Center, Container, Loader, Stack, Text } from "@mantine/core";
import { matchPath, Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import type { State } from "./api";
import { Header } from "./components/Header";
import { useI18n } from "./i18n";
import { Home } from "./pages/Home";
import { IngestionPage } from "./pages/IngestionPage";
import { Login } from "./pages/Login";
import { Operator } from "./pages/Operator";
import { RunPage } from "./pages/RunPage";
import { Status } from "./pages/Status";
import { Upload } from "./pages/Upload";
import { Welcome } from "./pages/Welcome";
import { useSession } from "./session";

export const PAGE_OF: Record<State, string> = {
  operator: "/operator",
  needs_company: "/welcome",
  pending: "/status",
  rejected: "/status",
  suspended: "/status",
  active: "/",
};
// An active company moves between its pages; every other state has exactly one.
const ACTIVE_PAGES = ["/", "/upload", "/ingestions/:id", "/runs/:id"];

function allowed(state: State, path: string): boolean {
  if (state === "active") return ACTIVE_PAGES.some((pattern) => matchPath(pattern, path));
  return path === PAGE_OF[state];
}

function Gate() {
  const { me, loading, failed, refresh } = useSession();
  const { t } = useI18n();
  const location = useLocation();
  if (loading) {
    return (
      <Center mih="60vh">
        <Loader />
      </Center>
    );
  }
  if (failed) {
    return (
      <Center mih="60vh">
        <Stack align="center">
          <Text>{t("common.error")}</Text>
          <Button variant="default" onClick={() => void refresh()}>
            ↻
          </Button>
        </Stack>
      </Center>
    );
  }
  const page = me ? PAGE_OF[me.state] : "/login";
  const here = me ? allowed(me.state, location.pathname) : location.pathname === page;
  if (!here) {
    return <Navigate to={{ pathname: page, search: location.search }} replace />;
  }
  return <Outlet />;
}

export function App() {
  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header withBorder={false} bg="transparent">
        <Header />
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Routes>
            <Route element={<Gate />}>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/status" element={<Status />} />
              <Route path="/operator" element={<Operator />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/ingestions/:id" element={<IngestionPage />} />
              <Route path="/runs/:id" element={<RunPage />} />
              <Route path="*" element={null} />
            </Route>
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
