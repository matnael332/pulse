// What changed since the previous month, per account: the server sorts the accounts into groups
// (see /changes); these helpers read them for the screens.
import type { AccountChange, ChangeGroup } from "../api";

export const GROUPS: ChangeGroup[] = ["entered_high", "rose", "gone"];

/** An account's figures as a group shows them: now, or the last ones known for those gone. */
export function shown(account: AccountChange, group: ChangeGroup) {
  const gone = group === "gone";
  return {
    level: gone ? account.level_before : account.level,
    probability: gone ? account.probability_before : account.probability,
    mrr: gone ? account.mrr_before : account.mrr,
  };
}
