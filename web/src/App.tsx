// The site: the landing page for visitors, then one page per state of the signed-in user, chosen
// by the gate (gate.ts) from /api/me.
import { AppShell, Button, Center, Container, Loader, Stack, Text } from "@mantine/core";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";

import { Header } from "./components/Header";
import { allowed, home } from "./gate";
import { useI18n } from "./i18n";
import { Home } from "./pages/Home";
import { IngestionPage } from "./pages/IngestionPage";
import { Landing } from "./pages/Landing";
import { Operator } from "./pages/Operator";
import { RunPage } from "./pages/RunPage";
import { Status } from "./pages/Status";
import { Upload } from "./pages/Upload";
import { Welcome } from "./pages/Welcome";
import { useSession } from "./session";

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
  if (!allowed(me, location.pathname)) {
    return <Navigate to={{ pathname: home(me), search: location.search }} replace />;
  }
  return me ? <Outlet /> : <Landing />;
}

/** The signed-in pages: the header and a centred column. */
function Shell() {
  return (
    <AppShell header={{ height: 64 }} padding="lg">
      <AppShell.Header withBorder={false} bg="transparent">
        <Header />
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Gate />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/status" element={<Status />} />
          <Route path="/operator" element={<Operator />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/ingestions/:id" element={<IngestionPage />} />
          <Route path="/runs/:id" element={<RunPage />} />
        </Route>
        <Route path="*" element={null} />
      </Route>
    </Routes>
  );
}
