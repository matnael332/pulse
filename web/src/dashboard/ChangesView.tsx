// What changed since the previous month: the accounts that entered high risk, the ones whose risk
// went up, and the ones at risk last month that are no longer in the data (most likely cancelled).
// The overview has the counts (a panel under the first screen), the tab has the lists. The server
// picks the month compared with and sorts the accounts; a run with nothing to compare with shows
// no panel, and the tab says so.
import { Loader, Table } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  getChanges,
  type AccountChange,
  type ChangeGroup,
  type Changes,
  type Currency,
  type RunInfo,
} from "../api";
import { type Key, useI18n } from "../i18n";
import { label } from "../labels";
import { GROUPS, shown } from "./changes";
import classes from "./Dashboard.module.css";
import { day } from "./deltas";

const TITLE: Record<ChangeGroup, Key> = {
  entered_high: "changes.enteredHigh",
  rose: "changes.rose",
  gone: "changes.gone",
};

/** The changes of a run: undefined while loading, null when they cannot be read. */
export function useChanges(runId: string): Changes | null | undefined {
  const [changes, setChanges] = useState<Changes | null | undefined>(undefined);
  useEffect(() => {
    setChanges(undefined);
    getChanges(runId)
      .then(setChanges)
      .catch(() => setChanges(null));
  }, [runId]);
  return changes;
}

function useFormats(currency: Currency) {
  const { locale } = useI18n();
  return {
    count: new Intl.NumberFormat(locale),
    percent: new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    money: new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }),
  };
}

/** "Compared with the data as of ...": the month the changes count from. */
function Since({ changes }: { changes: Changes }) {
  const { t, locale } = useI18n();
  const when = changes.base?.snapshot_date ?? changes.base?.finished_at;
  if (!when) return null;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(day(when));
  return <p className={classes.note}>{t("changes.vs", { date })}</p>;
}

/** Where an account was before: its level last month, or new in the data. */
function Before({ account }: { account: AccountChange }) {
  const { t, lang } = useI18n();
  return (
    <span className={classes.sub}>
      {account.level_before
        ? t("changes.from", { value: label.risk(account.level_before, lang) })
        : t("changes.new")}
    </span>
  );
}

function Level({ level }: { level: AccountChange["level"] }) {
  const { lang } = useI18n();
  if (!level) return <span className={classes.muted}>—</span>;
  return (
    <span className={classes.level} data-level={level}>
      {label.risk(level, lang)}
    </span>
  );
}

function Name({ account }: { account: AccountChange }) {
  return (
    <>
      {account.name || account.customer_id || account.id}
      {account.name && account.customer_id && (
        <span className={classes.sub}>{account.customer_id}</span>
      )}
    </>
  );
}

/** On the overview, under the first screen: the three counts, and the way to the lists. */
export function ChangesPanel({ changes }: { changes: Changes }) {
  const { t, locale } = useI18n();
  const count = new Intl.NumberFormat(locale);
  return (
    <section className={`${classes.panel} ${classes.flush}`} aria-labelledby="changes-title">
      <div className={classes.panelHead}>
        <div className={classes.grow}>
          <h2 id="changes-title" className={`${classes.display} ${classes.panelTitle}`}>
            {t("results.changes")}
          </h2>
          <Since changes={changes} />
        </div>
        <Link to={{ search: "?view=changes" }} className={classes.link}>
          {t("changes.all")}
        </Link>
      </div>
      <dl className={`${classes.strip} ${classes.three} ${classes.ruled}`}>
        {GROUPS.map((group) => (
          <div key={group} className={group === "entered_high" ? classes.high : undefined}>
            <dt>{t(TITLE[group])}</dt>
            <dd className={classes.value}>{count.format(changes.counts[group])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One group in full: who, the level now and before, how likely to leave, what it pays. */
function GroupTable({
  changes,
  group,
  currency,
}: {
  changes: Changes;
  group: ChangeGroup;
  currency: Currency;
}) {
  const { t, lang } = useI18n();
  const f = useFormats(currency);
  const accounts = changes[group];
  return (
    <section className={`${classes.panel} ${classes.flush}`} aria-labelledby={`changes-${group}`}>
      <div className={classes.panelHead}>
        <div className={classes.grow}>
          <h2 id={`changes-${group}`} className={`${classes.display} ${classes.panelTitle}`}>
            {t(TITLE[group])}
          </h2>
          {group === "gone" && <p className={classes.note}>{t("changes.goneNote")}</p>}
        </div>
        <span className={`${classes.value} ${group === "entered_high" ? classes.bad : ""}`}>
          {f.count.format(accounts.length)}
        </span>
      </div>
      {accounts.length === 0 ? (
        <p className={`${classes.note} ${classes.inset}`}>{t("changes.empty")}</p>
      ) : (
        <Table.ScrollContainer minWidth={620}>
          <Table className={classes.table} highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("results.account")}</Table.Th>
                <Table.Th>{t("results.level")}</Table.Th>
                <Table.Th className={classes.num}>{t("results.probability")}</Table.Th>
                <Table.Th className={classes.num}>{label.column("mrr", lang)}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accounts.map((account) => {
                const now = shown(account, group);
                return (
                  <Table.Tr key={account.id}>
                    <Table.Td>
                      <Name account={account} />
                    </Table.Td>
                    <Table.Td>
                      <Level level={now.level} />
                      {group !== "gone" && <Before account={account} />}
                    </Table.Td>
                    <Table.Td className={classes.num}>
                      {now.probability == null ? "—" : f.percent.format(now.probability)}
                      {group !== "gone" && account.probability_before != null && (
                        <span className={classes.sub}>
                          {t("changes.from", {
                            value: f.percent.format(account.probability_before),
                          })}
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td className={classes.num}>
                      {now.mrr == null ? (
                        <span className={classes.muted}>—</span>
                      ) : (
                        f.money.format(now.mrr)
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </section>
  );
}

/** The tab: the three groups in full. */
export default function ChangesView({ run, currency }: { run: RunInfo; currency: Currency }) {
  const { t } = useI18n();
  const changes = useChanges(run.id);
  if (changes === undefined) return <Loader mx="auto" mt="xl" />;
  if (!changes?.base) {
    return (
      <section className={classes.panel}>
        <p className={classes.note}>{t("dashboard.noCompare")}</p>
      </section>
    );
  }
  return (
    <div className={classes.stack}>
      <Since changes={changes} />
      {GROUPS.map((group) => (
        <GroupTable key={group} changes={changes} group={group} currency={currency} />
      ))}
    </div>
  );
}
