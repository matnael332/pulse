// The landing page's sample accounts: invented companies, shown as such, with the product's own
// reason codes (labels.ts) and figures that read like a real month. Never real customers.
import type { Lang } from "../i18n";

type Both = [he: string, en: string];

export interface SampleReason {
  code: string; // a reason code of the model (labels.ts names it)
  detail: Both; // this month against the usual
}

export interface SampleAccount {
  id: string;
  name: Both;
  probability: number;
  level: "high" | "elevated" | "normal";
  mrr: number; // shekels a month
  reasons: SampleReason[];
}

export const SAMPLE: SampleAccount[] = [
  {
    id: "galil",
    name: ["מאפיית הגליל", "Galil Bakery"],
    probability: 0.94,
    level: "high",
    mrr: 1200,
    reasons: [
      { code: "payroll_exports", detail: ["0 החודש, בדרך כלל 4", "0 this month, usually 4"] },
      { code: "punch_activity", detail: ["38% פחות", "38% fewer"] },
      { code: "billing", detail: ["חשבונית באיחור של 21 יום", "an invoice 21 days late"] },
    ],
  },
  {
    id: "noga",
    name: ["סטודיו נגה", "Studio Noga"],
    probability: 0.71,
    level: "elevated",
    mrr: 640,
    reasons: [
      { code: "seats", detail: ["12 רישיונות, היו 18", "12 seats, was 18"] },
      { code: "admin_logins", detail: ["2 כניסות החודש, בדרך כלל 15", "2 this month, usually 15"] },
    ],
  },
  {
    id: "levi",
    name: ["משרד לוי ושות׳", "Levi & Co."],
    probability: 0.66,
    level: "elevated",
    mrr: 980,
    reasons: [
      { code: "support", detail: ["9 פניות החודש, בדרך כלל 2", "9 this month, usually 2"] },
      { code: "punch_edits", detail: ["31% מההחתמות תוקנו", "31% of punches edited"] },
    ],
  },
  {
    id: "kfar",
    name: ["Kfar Logistics", "Kfar Logistics"],
    probability: 0.88,
    level: "high",
    mrr: 2450,
    reasons: [
      { code: "active_employees", detail: ["64 עובדים, היו 112", "64 employees, was 112"] },
      { code: "modules", detail: ["2 מודולים, היו 5", "2 modules, was 5"] },
    ],
  },
  {
    id: "parpar",
    name: ["גני פרפר", "Parpar Kindergartens"],
    probability: 0.23,
    level: "normal",
    mrr: 410,
    reasons: [],
  },
];

export const pick = (both: Both, lang: Lang): string => both[lang === "he" ? 0 : 1];
