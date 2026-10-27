// The journey from a company's name to its results, as the landing page's stage bar: the steps
// behind are filled, the current one is white (with a bar running along it while it works, red if
// it failed), and the ones ahead say how long they take.
import { useI18n, type Key } from "../i18n";
import classes from "./Data.module.css";

export type RailStep =
  "company" | "approval" | "upload" | "read" | "review" | "prepare" | "model" | "results";

export const STEPS: RailStep[] = [
  "company",
  "approval",
  "upload",
  "read",
  "review",
  "prepare",
  "model",
  "results",
];

// how long a step ahead takes, as the landing page measured it on the demo
const TAKES: Partial<Record<RailStep, Key>> = {
  read: "landing.how.read.time",
  review: "landing.how.review.time",
  prepare: "landing.how.prepare.time",
  model: "landing.how.model.time",
};

interface Props {
  at: RailStep;
  working?: boolean;
  failed?: boolean;
  note?: string; // a word under the current step
}

export function Rail({ at, working = false, failed = false, note }: Props) {
  const { t } = useI18n();
  const current = STEPS.indexOf(at);
  return (
    <ol className={classes.rail}>
      {STEPS.map((step, i) => {
        const state = i < current ? classes.done : i === current ? classes.current : "";
        const extra = i === current && failed ? classes.failed : "";
        const moving = i === current && working && !failed ? classes.working : "";
        const takes = TAKES[step];
        return (
          <li
            key={step}
            className={`${classes.step} ${state} ${extra} ${moving}`}
            aria-current={i === current ? "step" : undefined}
          >
            <span className={classes.stepName}>{t(`rail.${step}` as Key)}</span>
            <span className={classes.stepSub}>
              {i === current ? note : i > current && takes ? t(takes) : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
