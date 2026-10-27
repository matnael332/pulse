// Who is at risk: every scored account, the ones at high risk first, with how likely each is to
// leave, what it pays a month and why. Filter by level, search by name or number, take it to Excel.
import { Button, Pagination, SegmentedControl, Table, TextInput, Tooltip } from "@mantine/core";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type { Currency, Results, ScoredAccount } from "../api";
import { useI18n } from "../i18n";
import { label } from "../labels";
import { download, riskCsv } from "./csv";
import classes from "./Dashboard.module.css";

const PAGE = 50;
type Filter = "all" | ScoredAccount["level"];

function number(value: number, digits = 2): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function AtRiskTable({ results, currency }: { results: Results; currency: Currency }) {
  const { t, lang, locale } = useI18n();
  const [filter, setFilter] = useState<Filter>("high");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.accounts.filter(
      (a) =>
        (filter === "all" || a.level === filter) &&
        (!q || a.name.toLowerCase().includes(q) || a.customer_id.includes(q) || a.id.includes(q)),
    );
  }, [results.accounts, filter, query]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const visible = shown.slice((page - 1) * PAGE, page * PAGE);

  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  function exportCsv() {
    const headers = [
      t("results.rank"),
      t("results.number"),
      t("results.account"),
      t("results.level"),
      `${t("results.probability")} (%)`,
      `${label.column("mrr", lang)} (${currency})`,
      t("results.reasons"),
    ];
    download(riskCsv(shown, lang, headers), `pulse-risk-${results.run.id}.csv`);
  }

  return (
    <section
      id="at-risk"
      className={`${classes.panel} ${classes.flush}`}
      aria-labelledby="at-risk-title"
    >
      <div className={classes.panelHead}>
        <h2 id="at-risk-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t("results.atRisk")}
        </h2>
        <Button
          variant="default"
          leftSection={<IconDownload size={16} />}
          onClick={exportCsv}
          size="compact-md"
        >
          {t("results.download")}
        </Button>
      </div>
      <div className={classes.tools}>
        <SegmentedControl
          radius="xl"
          value={filter}
          onChange={(value) => {
            setFilter(value as Filter);
            setPage(1);
          }}
          data={[
            { value: "high", label: label.risk("high", lang) },
            { value: "elevated", label: label.risk("elevated", lang) },
            { value: "normal", label: label.risk("normal", lang) },
            { value: "all", label: t("results.all") },
          ]}
        />
        <TextInput
          w={280}
          size="sm"
          leftSection={<IconSearch size={16} />}
          placeholder={t("results.search")}
          aria-label={t("results.search")}
          type="search"
          name="q"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
        />
      </div>
      {visible.length === 0 ? (
        <p className={classes.empty}>{t("results.empty")}</p>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table className={classes.table} highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className={classes.num}>{t("results.rank")}</Table.Th>
                <Table.Th>{t("results.account")}</Table.Th>
                <Table.Th>{t("results.level")}</Table.Th>
                <Table.Th className={classes.num}>{t("results.probability")}</Table.Th>
                <Table.Th className={classes.num}>{label.column("mrr", lang)}</Table.Th>
                <Table.Th>{t("results.reasons")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td className={`${classes.num} ${classes.muted}`}>{a.rank}</Table.Td>
                  <Table.Td>
                    {a.name || a.customer_id || a.id}
                    {a.name && a.customer_id && (
                      <span className={classes.sub}>{a.customer_id}</span>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <span className={classes.level} data-level={a.level}>
                      {label.risk(a.level, lang)}
                    </span>
                  </Table.Td>
                  <Table.Td className={classes.num}>{percent.format(a.probability)}</Table.Td>
                  <Table.Td className={classes.num}>
                    {a.mrr == null ? <span className={classes.muted}>—</span> : money.format(a.mrr)}
                  </Table.Td>
                  <Table.Td>
                    {a.reasons.length === 0 ? (
                      <span className={classes.muted}>{t("results.noReasons")}</span>
                    ) : (
                      <span className={classes.reasons}>
                        {a.reasons.map((r) => (
                          <Tooltip
                            key={r.feature}
                            label={t("results.reasonTip", {
                              value: number(r.value),
                              typical: number(r.typical),
                            })}
                          >
                            <span className={classes.reason} tabIndex={0}>
                              {label.reason(r.code, lang)}
                            </span>
                          </Tooltip>
                        ))}
                      </span>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {pages > 1 && (
        <div className={classes.pages}>
          <Pagination total={pages} value={page} onChange={setPage} />
        </div>
      )}
    </section>
  );
}
