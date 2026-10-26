// A refusal's code and params, worded in the page's language (unknown codes: the generic text).
import type { Problem } from "./api";
import { DICTIONARIES, type Key, type Lang, translate } from "./i18n";
import { label } from "./labels";

export function problemText(problem: Problem | null | undefined, lang: Lang): string {
  if (!problem) return "";
  const key = `error.${problem.code}`;
  const known = key in DICTIONARIES.he ? (key as Key) : "error.internal";
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(problem.params ?? {})) {
    if (name === "groups" && Array.isArray(value)) {
      values[name] = value.map((g) => label.group(String(g), lang)).join(", ");
    } else if (name === "stage") {
      values[name] = label.stage(String(value), lang);
    } else if (name === "column") {
      values[name] = label.column(String(value), lang);
    } else if (Array.isArray(value)) {
      values[name] = value.join(", ");
    } else {
      values[name] = String(value ?? "");
    }
  }
  return translate(lang, known, values);
}
