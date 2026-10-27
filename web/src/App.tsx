// The site: the landing page for visitors; for a company, its data page (from its name to a run)
// and its dashboard; for the operator, the companies screen. The gate (gate.ts) decides from
// /api/me, and moves the old addresses to the new ones.
import { Button, Center, Loader, Stack, Text } from "@mantine/core";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router";

import { allowed, home, legacy } from "./gate";
import { useI18n } from "./i18n";
import { Dashboard } from "./pages/Dashboard";
import { Data } from "./pages/Data";
import { Landing } from "./pages/Landing";
import { Operator } from "./pages/Operator";
import { Root } from "./pages/Root";
import { useSession } from "./session";
import { Shell } from "./shell/Shell";

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
  const moved = me && legacy(location.pathname);
  if (moved) return <Navigate to={{ pathname: moved, search: location.search }} replace />;
  if (!allowed(me, location.pathname)) {
    return <Navigate to={{ pathname: home(me), search: location.search }} replace />;
  }
  return me ? <Outlet /> : <Landing />;
}

function Step({ kind }: { kind: "ingestion" | "run" }) {
  const { id = "" } = useParams();
  return <Data view={{ kind, id }} />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Gate />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Root />} />
          <Route path="/data" element={<Data view={{ kind: "start" }} />} />
          <Route path="/data/ingestions/:id" element={<Step kind="ingestion" />} />
          <Route path="/data/runs/:id" element={<Step kind="run" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/:runId" element={<Dashboard />} />
          <Route path="/operator" element={<Operator />} />
        </Route>
        <Route path="*" element={null} />
      </Route>
    </Routes>
  );
}
