// The copilot: questions about one run's results, answered from its figures by the language model.
// The names stay here: a question goes with the accounts named by id (names.ts), the answer comes
// back with ids and is shown with names. The conversation lives in this component; the last turns
// go with each question, by id. Nothing is sent until the accounts are known, so a name typed
// early cannot slip through.
import { Button, CloseButton, Textarea, VisuallyHidden } from "@mantine/core";
import { IconMessageCircle } from "@tabler/icons-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  ApiError,
  askCopilot,
  getChanges,
  getResults,
  type CopilotTurn,
  type Problem,
} from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { problemText } from "../problems";
import classes from "./Dashboard.module.css";
import { type Known, personalize, pseudonymize } from "./names";

const TURNS = 3; // question and answer pairs sent as history (six turns)
const SUGGESTIONS = ["copilot.suggest1", "copilot.suggest2", "copilot.suggest3"] as const;

interface Entry {
  question: string; // as the reader typed it, shown
  sent: string; // as sent: accounts by id
  answer?: string; // as received: accounts by id
  ungrounded?: string[];
  problem?: Problem | null;
}

/** The accounts the run knows (scored now, and gone since last month), or null while loading. */
function useKnown(runId: string): Known[] | null {
  const [known, setKnown] = useState<Known[] | null>(null);
  useEffect(() => {
    let live = true;
    setKnown(null);
    getResults(runId)
      .then(async (results) => {
        const gone = await getChanges(runId)
          .then((changes) => changes.gone)
          .catch(() => []);
        if (live) setKnown([...results.accounts, ...gone]);
      })
      .catch(() => undefined); // no results, no questions: the input stays closed
    return () => {
      live = false;
    };
  }, [runId]);
  return known;
}

export function Chat({ runId }: { runId: string }) {
  const { t, lang } = useI18n();
  const known = useKnown(runId);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const busy =
    entries.length > 0 &&
    entries.at(-1)!.answer === undefined &&
    entries.at(-1)!.problem === undefined;

  function settle(update: Partial<Entry>) {
    setEntries((was) => was.map((e, i) => (i === was.length - 1 ? { ...e, ...update } : e)));
  }

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy || !known) return;
    const sent = pseudonymize(question, known);
    const history: CopilotTurn[] = entries
      .filter((e) => e.answer !== undefined)
      .slice(-TURNS)
      .flatMap((e) => [
        { role: "user" as const, text: e.sent },
        { role: "model" as const, text: e.answer! },
      ]);
    setEntries((was) => [...was, { question, sent }]);
    setDraft("");
    askCopilot(runId, { message: sent, history, language: lang, glossary: label.glossary(lang) })
      .then((answer) => settle({ answer: answer.text, ungrounded: answer.ungrounded }))
      .catch((error) => settle({ problem: error instanceof ApiError ? error.problem : null }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(draft);
  }

  function keys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      ask(draft);
    }
  }

  return (
    <div className={classes.chat}>
      {entries.length === 0 ? (
        <div className={classes.suggestions}>
          {SUGGESTIONS.map((key) => (
            <Button
              key={key}
              variant="default"
              radius="xl"
              size="compact-sm"
              disabled={!known}
              onClick={() => ask(t(key))}
            >
              {t(key)}
            </Button>
          ))}
        </div>
      ) : (
        <ol className={classes.turns} aria-live="polite">
          {entries.map((entry, index) => (
            <li key={index}>
              <p className={classes.asked}>
                <VisuallyHidden>{t("copilot.question")}: </VisuallyHidden>
                {entry.question}
              </p>
              {entry.answer !== undefined ? (
                <div className={classes.answered}>
                  <VisuallyHidden>{t("copilot.answer")}: </VisuallyHidden>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {personalize(entry.answer, known ?? [])}
                  </ReactMarkdown>
                  {entry.ungrounded && entry.ungrounded.length > 0 && (
                    <p className={classes.note}>
                      {t("copilot.unchecked", { values: entry.ungrounded.join(", ") })}
                    </p>
                  )}
                </div>
              ) : entry.problem !== undefined ? (
                <p className={classes.problem}>{problemText(entry.problem, lang)}</p>
              ) : (
                <p className={classes.note}>{t("copilot.thinking")}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      <form className={classes.ask} onSubmit={submit}>
        <Textarea
          className={classes.askInput}
          autosize
          minRows={1}
          maxRows={5}
          maxLength={2000}
          name="question"
          autoComplete="off"
          aria-label={t("copilot.title")}
          placeholder={t("copilot.placeholder")}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={keys}
        />
        <Button type="submit" loading={busy} disabled={!known}>
          {t("copilot.send")}
        </Button>
      </form>
      <div className={classes.chatFoot}>
        <p className={classes.note}>{t("copilot.privacy")}</p>
        {entries.length > 0 && !busy && (
          <Button variant="subtle" size="compact-sm" onClick={() => setEntries([])}>
            {t("copilot.clear")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The copilot afloat: a button in the corner of every tab, opening a small window above the
 * page. The conversation stays while the window is closed; Escape closes it. */
export function FloatingCopilot({ runId }: { runId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) panel.current?.querySelector("textarea")?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  return (
    <>
      <div
        ref={panel}
        id="copilot-window"
        role="dialog"
        aria-labelledby="copilot-window-title"
        className={classes.floatPanel}
        hidden={!open}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <div className={classes.floatHead}>
          <h2 id="copilot-window-title" className={`${classes.display} ${classes.floatTitle}`}>
            {t("copilot.title")}
          </h2>
          <CloseButton aria-label={t("copilot.close")} onClick={close} />
        </div>
        <Chat runId={runId} />
      </div>
      <div className={classes.floatButton}>
        <Button
          ref={button}
          radius="xl"
          leftSection={<IconMessageCircle size={18} />}
          aria-expanded={open}
          aria-controls="copilot-window"
          onClick={() => (open ? close() : setOpen(true))}
        >
          {t("copilot.open")}
        </Button>
      </div>
    </>
  );
}
