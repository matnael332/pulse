// An active company's home address: to the step its upload or run is at, else to its latest
// result, else to its data page.
import { Loader } from "@mantine/core";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";

import { getMyCompany } from "../api";
import { stepOf } from "./Data";

export function Root() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    getMyCompany()
      .then((company) =>
        setTarget(
          company.current
            ? stepOf(company.current)
            : company.latest_run
              ? `/dashboard/${company.latest_run.id}`
              : "/data",
        ),
      )
      .catch(() => setTarget("/data"));
  }, []);

  return target ? <Navigate to={target} replace /> : <Loader mx="auto" mt="xl" />;
}
