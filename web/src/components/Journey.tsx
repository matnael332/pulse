import { Stepper } from "@mantine/core";

import { useI18n } from "../i18n";

export type JourneyStep = "upload" | "read" | "review" | "prepare" | "run";
const STEPS: JourneyStep[] = ["upload", "read", "review", "prepare", "run"];

/** Where an upload stands on its way to a model. */
export function Journey({ at, failed = false }: { at: JourneyStep; failed?: boolean }) {
  const { t } = useI18n();
  const active = STEPS.indexOf(at);
  return (
    <Stepper
      active={active}
      size="sm"
      color={failed ? "red" : undefined}
      allowNextStepsSelect={false}
    >
      {STEPS.map((step) => (
        <Stepper.Step key={step} label={t(`steps.${step}`)} loading={!failed && step === at} />
      ))}
    </Stepper>
  );
}
