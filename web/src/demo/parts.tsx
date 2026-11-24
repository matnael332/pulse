// What the demo adds to the site, in its places (slots.tsx): the way in, how to try it, what the
// system is doing in its own numbers, and what each part of the dashboard is.
import { Button } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useSyncExternalStore } from "react";
import { useNavigate } from "react-router";

import { tryDemo } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import landing from "../landing/Landing.module.css";
import { useSession } from "../session";
import type { Area, Step } from "../slots";
import data from "../data/Data.module.css";
import classes from "./Demo.module.css";
import type { Facts } from "./engine";
import type { DemoServer, Progress } from "./server";
import { useWords, type Word } from "./words";

const GITHUB = "https://github.com/matnael332/pulse";
const CONTACT = "https://www.xplace.com/il/u/user1793008148659";
const SAMPLE = `${import.meta.env.BASE_URL}sample/pulse-sample-export.zip`;
const NOTES = "pulse.demo.notes";
const MB = 1 << 20;

export function parts(demo: DemoServer) {
  function Entry({ short = false }: { short?: boolean }) {
    const w = useWords();
    const { refresh } = useSession();
    const navigate = useNavigate();
    async function enter() {
      demo.start();
      await refresh();
      navigate("/data");
    }
    return (
      <div className={short ? landing.choiceRow : landing.actions}>
        <button
          type="button"
          className={`${landing.button} ${landing.filled}`}
          onClick={() => void enter()}
        >
          {w("enter")}
        </button>
        <a className={landing.button} href={GITHUB}>
          {w("code")}
        </a>
      </div>
    );
  }

  function Links() {
    const w = useWords();
    return (
      <div className={landing.footerLinks}>
        <a className={landing.navLink} href={CONTACT}>
          {w("contact")}
        </a>
        <a className={landing.navLink} href={GITHUB}>
          {w("code")}
        </a>
      </div>
    );
  }

  function Banner() {
    const w = useWords();
    return <p className={classes.banner}>{w(demo.able ? "banner" : "bannerReady")}</p>;
  }

  function Foot() {
    const w = useWords();
    return (
      <footer className={classes.foot}>
        <a href={CONTACT}>{w("contact")}</a>
        <a href={GITHUB}>{w("code")}</a>
      </footer>
    );
  }

  /** On the data page, before anything else: the three things to do. */
  function Guide() {
    const w = useWords();
    const { lang } = useI18n();
    const navigate = useNavigate();
    if (!demo.able) {
      return (
        <section className={`${data.panel} ${classes.guide}`} aria-labelledby="guide-title">
          <h2 id="guide-title" className={`${data.display} ${data.panelTitle}`}>
            {w("phoneTitle")}
          </h2>
          <p className={data.panelLead}>{w("phoneBody")}</p>
          <Button
            onClick={() =>
              void tryDemo(lang).then((ingestion) => navigate(`/data/ingestions/${ingestion.id}`))
            }
          >
            {w("ready")}
          </Button>
        </section>
      );
    }
    const steps: [Word, Word][] = [
      ["step1", "step1Body"],
      ["step2", "step2Body"],
      ["step3", "step3Body"],
    ];
    return (
      <section className={`${data.panel} ${classes.guide}`} aria-labelledby="guide-title">
        <h2 id="guide-title" className={`${data.display} ${data.panelTitle}`}>
          {w("guideTitle")}
        </h2>
        <ol className={classes.steps}>
          {steps.map(([title, body], i) => (
            <li key={title}>
              <span className={classes.number} aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <p className={classes.stepTitle}>{w(title)}</p>
                <p className={classes.stepBody}>{w(body)}</p>
                {i === 0 && (
                  <Button
                    component="a"
                    href={SAMPLE}
                    download
                    size="sm"
                    mt="sm"
                    leftSection={<IconDownload size={16} stroke={1.5} />}
                  >
                    {w("download")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
        <Waiting demo={demo} />
      </section>
    );
  }

  /** Beside each step: what the system is doing, and what it did so far, in its own numbers. */
  function Explain({ step }: { step: Step }) {
    const w = useWords();
    const { lang } = useI18n();
    const progress = useSyncExternalStore(demo.subscribe, demo.snapshot);
    if (step === "failed") {
      const groups = String(progress.facts.refused?.present ?? "")
        .split(",")
        .filter(Boolean)
        .map((group) => label.group(group, lang));
      return (
        <div className={classes.explain}>
          {groups.length > 0 && <p>{w("recognised", { groups: groups.join(", ") })}</p>}
          <p>{w("failed")}</p>
          <Button
            component="a"
            href={SAMPLE}
            download
            variant="default"
            size="sm"
            leftSection={<IconDownload size={16} stroke={1.5} />}
          >
            {w("download")}
          </Button>
        </div>
      );
    }
    const facts = told(progress, step);
    const content = (
      <>
        <h3 className={classes.explainTitle}>{w(step === "review" ? "understood" : "now")}</h3>
        <p>{w(step)}</p>
        {facts.length > 0 && (
          <ul className={classes.facts} aria-live="polite">
            {facts.map(([word, values]) => (
              <li key={word}>
                <span className="point" data-level="elevated" aria-hidden="true" />
                {w(word, values)}
              </li>
            ))}
          </ul>
        )}
        {step === "read" && <Waiting demo={demo} />}
      </>
    );
    return step === "review" ? (
      <section className={`${data.panel} ${classes.guide}`}>{content}</section>
    ) : (
      <div className={classes.explain}>{content}</div>
    );
  }

  /** Under a heading of the dashboard: what this part is, until the visitor hides them. */
  function Note({ area }: { area: Area }) {
    const w = useWords();
    const shown = useNotes();
    const word = `note${area[0].toUpperCase()}${area.slice(1)}` as Word;
    const note = shown && (
      <p className={`${classes.note} ${area === "table" ? classes.noteInset : ""}`}>{w(word)}</p>
    );
    if (area !== "sky") return note;
    return (
      <div className={classes.notesRow}>
        {note}
        <Button variant="default" size="compact-sm" onClick={() => setNotes(!shown)}>
          {w(shown ? "hideNotes" : "showNotes")}
        </Button>
      </div>
    );
  }

  return {
    entry: Entry,
    links: Links,
    banner: Banner,
    foot: Foot,
    guide: Guide,
    explain: Explain,
    note: Note,
  };
}

/** Python on its way: how much is left, then that it is starting. */
function Waiting({ demo }: { demo: DemoServer }) {
  const w = useWords();
  const { loading } = useSyncExternalStore(demo.subscribe, demo.snapshot);
  if (!loading) return null;
  const arrived = loading.total > 0 && loading.loaded >= loading.total;
  return (
    <div className={classes.waiting}>
      <div
        className={classes.waitingBar}
        style={{ transform: `scaleX(${loading.total ? loading.loaded / loading.total : 0})` }}
      />
      <p aria-live="polite">
        {arrived
          ? w("warming")
          : w("loading", {
              loaded: Math.round(loading.loaded / MB),
              total: Math.round(loading.total / MB),
            })}
      </p>
    </div>
  );
}

/** The facts a step may show: what the runner told, in the order it did. */
function told({ facts }: Progress, step: Step): [Word, Facts][] {
  const order: [Word, string][] =
    step === "read" || step === "review"
      ? [
          ["factFiles", "propose"],
          ["factTables", "propose"],
          ["factLeftOut", "propose"],
        ]
      : [
          ["factAccounts", "apply"],
          ["factCancellations", "apply"],
          ["factClean", "gate_contract"],
          ["factFeatures", "gate_required_features"],
          ["factModels", "run_modeling_phase"],
          ["factChosen", "gate_artifacts"],
          ["factScored", "promote_and_finish"],
        ];
  return order.flatMap(([word, stage]) => {
    const values = facts[stage];
    return values ? [[word, values] as [Word, Facts]] : [];
  });
}

const watchers = new Set<() => void>();
function notesShown(): boolean {
  try {
    return localStorage.getItem(NOTES) !== "off";
  } catch {
    return true;
  }
}
function setNotes(on: boolean) {
  try {
    localStorage.setItem(NOTES, on ? "on" : "off");
  } catch {
    // not kept: shown again next time
  }
  watchers.forEach((watcher) => watcher());
}
function useNotes(): boolean {
  return useSyncExternalStore((watcher) => {
    watchers.add(watcher);
    return () => watchers.delete(watcher);
  }, notesShown);
}
