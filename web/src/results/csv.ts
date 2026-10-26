// The risk list as a CSV for Excel: a byte-order mark (so Excel reads Hebrew), labels in the
// page's language, and no cell that Excel would run as a formula.
import type { ScoredAccount } from "../api";
import type { Lang } from "../i18n";
import { label } from "../labels";

function cell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // formula injection
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function riskCsv(accounts: ScoredAccount[], lang: Lang, headers: string[]): string {
  const rows = accounts.map((a) => [
    a.rank,
    a.customer_id || a.id,
    a.name,
    label.risk(a.level, lang),
    (a.probability * 100).toFixed(1),
    a.reasons.map((r) => label.reason(r.code, lang)).join("; "),
  ]);
  const lines = [headers, ...rows].map((row) => row.map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
