import { Alert } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";

import type { Problem } from "../api";
import { useI18n } from "../i18n";
import { problemText } from "../problems";

/** A refusal or a failure, worded for the company. */
export function ErrorNotice({
  problem,
  title,
  children,
}: {
  problem: Problem | null;
  title?: string;
  children?: ReactNode;
}) {
  const { lang } = useI18n();
  return (
    <Alert
      color="red"
      variant="light"
      radius="md"
      title={title}
      icon={<IconAlertTriangle size={20} />}
    >
      {problemText(problem ?? { code: "internal", params: {} }, lang)}
      {children}
    </Alert>
  );
}
