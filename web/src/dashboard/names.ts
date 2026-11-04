// Account names stay in the browser. Before a question goes to the copilot, the names and account
// numbers the reader typed become the pseudonyms the copilot knows (acc_000123); in its answer,
// the pseudonyms become names again. A name typed with a typo is not recognised and goes as typed.

export interface Known {
  id: string;
  name: string;
  customer_id: string;
}

const PREFIX = "[והבכלמש]{0,2}"; // Hebrew letters glued to a word: ו ה ב כ ל מ ש
const EDGE = "\\p{L}\\p{N}_"; // a match never starts or ends inside a word or an id

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, "\\$&");
}

/** The question with every known name and account number replaced by its id, the longest first;
 * a name two accounts share becomes both ids. */
export function pseudonymize(text: string, accounts: Known[]): string {
  const ids = new Map<string, string[]>();
  for (const account of accounts) {
    for (const term of [account.name.trim(), account.customer_id.trim()]) {
      if (term.length < 2) continue;
      const known = ids.get(term) ?? [];
      if (!known.includes(account.id)) ids.set(term, [...known, account.id]);
    }
  }
  let out = text;
  for (const term of [...ids.keys()].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(?<![${EDGE}])(${PREFIX})${escapeRegex(term)}(?![${EDGE}])`, "gu");
    out = out.replace(
      pattern,
      (_match, prefix: string) => `${prefix}${ids.get(term)!.join(" / ")}`,
    );
  }
  return out;
}

/** The answer (markdown) with every id it names replaced by the account's name, else its number;
 * an id the browser does not know stays as it is. */
export function personalize(text: string, accounts: Known[]): string {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return text.replace(/acc_\d{6}/g, (id) => {
    const account = byId.get(id);
    const shown = account?.name || account?.customer_id;
    return shown ? escapeMarkdown(shown) : id;
  });
}
