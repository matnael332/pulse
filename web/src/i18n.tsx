// Hebrew and English. The browser's language picks the first one (English for an English
// browser, Hebrew otherwise); the choice the user makes is saved. Hebrew is the source of the
// keys, so a key missing from English is a type error.
import { useDirection } from "@mantine/core";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const he = {
  "app.name": "pulse",
  "app.tagline": "מי מהלקוחות שלכם עומד לעזוב, לפני שהוא עוזב.",
  "lang.switch": "English",
  "common.loading": "טוען…",
  "common.error": "משהו השתבש. נסו שוב.",
  "common.cancel": "ביטול",
  "common.signOut": "יציאה",
  "login.title": "כניסה",
  "login.google": "המשך עם גוגל",
  "login.microsoft": "המשך עם מיקרוסופט",
  "login.dev": "כניסת פיתוח",
  "login.devEmail": "כתובת דואר",
  "login.devSubmit": "כניסה",
  "login.none": "ההתחברות עדיין לא הוגדרה בשרת.",
  "login.failed": "ההתחברות נכשלה. נסו שוב.",
  "login.footer": "חשבון אחד לכל חברה. נאשר כל חברה לפני שמתחילים.",
  "welcome.title": "ברוכים הבאים",
  "welcome.lead": "איך קוראים לחברה שלכם?",
  "welcome.name": "שם החברה",
  "welcome.submit": "שליחה לאישור",
  "welcome.tooShort": "לפחות שני תווים",
  "status.pending.title": "הבקשה בבדיקה",
  "status.pending.body": "נאשר את {name} בהקדם. אפשר לסגור את הדף ולחזור אחר כך.",
  "status.rejected.title": "הבקשה לא אושרה",
  "status.rejected.body": "לא יכולנו לאשר את {name}.",
  "status.suspended.title": "החשבון מושהה",
  "status.suspended.body": "הגישה של {name} הושהתה. כתבו לנו לפרטים.",
  "status.reason": "הסיבה: {note}",
  "home.title": "{name}",
  "home.next.title": "השלב הבא: העלאת הנתונים",
  "home.next.body":
    "בקרוב תוכלו להעלות כאן ייצוא ממערכת הנוכחות שלכם ולקבל את רשימת הלקוחות שבסיכון לעזוב, עם הסיבות.",
  "home.model": "יש מודל פעיל לחברה.",
  "operator.title": "חברות",
  "operator.pending": "ממתינות",
  "operator.active": "פעילות",
  "operator.rejected": "נדחו",
  "operator.suspended": "מושעות",
  "operator.empty": "אין חברות כאן.",
  "operator.name": "חברה",
  "operator.user": "משתמש",
  "operator.created": "נרשמה",
  "operator.folder": "תיקייה",
  "operator.approve": "אישור",
  "operator.reject": "דחייה",
  "operator.suspend": "השעיה",
  "operator.reactivate": "החזרה",
  "operator.approveTitle": "אישור {name}",
  "operator.slug": "שם התיקייה",
  "operator.slugHint": "אותיות לטיניות קטנות, ספרות ומקפים. ריק: לפי שם החברה.",
  "operator.rejectTitle": "דחיית {name}",
  "operator.suspendTitle": "השעיית {name}",
  "operator.reactivateTitle": "החזרת {name}",
  "operator.note": "הערה (החברה תראה אותה)",
  "operator.confirm": "אישור הפעולה",
} as const;

type Key = keyof typeof he;

const en: Record<Key, string> = {
  "app.name": "pulse",
  "app.tagline": "Which of your customers are about to leave, before they do.",
  "lang.switch": "עברית",
  "common.loading": "Loading…",
  "common.error": "Something went wrong. Please try again.",
  "common.cancel": "Cancel",
  "common.signOut": "Sign out",
  "login.title": "Sign in",
  "login.google": "Continue with Google",
  "login.microsoft": "Continue with Microsoft",
  "login.dev": "Development sign-in",
  "login.devEmail": "Email address",
  "login.devSubmit": "Sign in",
  "login.none": "Sign-in is not set up on the server yet.",
  "login.failed": "Sign-in failed. Please try again.",
  "login.footer": "One account per company. We approve every company before it starts.",
  "welcome.title": "Welcome",
  "welcome.lead": "What is your company called?",
  "welcome.name": "Company name",
  "welcome.submit": "Send for approval",
  "welcome.tooShort": "At least two characters",
  "status.pending.title": "We're reviewing your request",
  "status.pending.body": "We'll approve {name} soon. You can close this page and come back later.",
  "status.rejected.title": "Your request was not approved",
  "status.rejected.body": "We could not approve {name}.",
  "status.suspended.title": "Your account is suspended",
  "status.suspended.body": "Access for {name} is suspended. Write to us for details.",
  "status.reason": "Reason: {note}",
  "home.title": "{name}",
  "home.next.title": "Next: upload your data",
  "home.next.body":
    "Soon you will upload an export from your time-attendance system here and get the list of customers at risk of leaving, with the reasons.",
  "home.model": "Your company has an active model.",
  "operator.title": "Companies",
  "operator.pending": "Pending",
  "operator.active": "Active",
  "operator.rejected": "Rejected",
  "operator.suspended": "Suspended",
  "operator.empty": "No companies here.",
  "operator.name": "Company",
  "operator.user": "User",
  "operator.created": "Signed up",
  "operator.folder": "Folder",
  "operator.approve": "Approve",
  "operator.reject": "Reject",
  "operator.suspend": "Suspend",
  "operator.reactivate": "Reactivate",
  "operator.approveTitle": "Approve {name}",
  "operator.slug": "Folder name",
  "operator.slugHint":
    "Lower-case Latin letters, digits and hyphens. Empty: from the company's name.",
  "operator.rejectTitle": "Reject {name}",
  "operator.suspendTitle": "Suspend {name}",
  "operator.reactivateTitle": "Reactivate {name}",
  "operator.note": "Note (the company sees it)",
  "operator.confirm": "Confirm",
};

export type Lang = "he" | "en";
export const DICTIONARIES: Record<Lang, Record<Key, string>> = { he, en };
const STORAGE_KEY = "pulse.lang";

/** The saved choice, else English for an English browser, else Hebrew. */
export function detectLanguage(saved: string | null, browser: readonly string[]): Lang {
  if (saved === "he" || saved === "en") return saved;
  return (browser[0] ?? "").toLowerCase().startsWith("en") ? "en" : "he";
}

export function translate(lang: Lang, key: Key, values: Record<string, string> = {}): string {
  return DICTIONARIES[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}

function savedLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface I18n {
  lang: Lang;
  t: (key: Key, values?: Record<string, string>) => string;
  setLang: (lang: Lang) => void;
  locale: string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    detectLanguage(savedLanguage(), navigator.languages ?? [navigator.language]),
  );
  const { setDirection } = useDirection();
  const setLang = useCallback(
    (next: Lang) => {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // private mode: the choice lasts for this page only
      }
      const dir = next === "he" ? "rtl" : "ltr";
      document.documentElement.lang = next;
      document.documentElement.dir = dir;
      setDirection(dir);
      setLangState(next);
    },
    [setDirection],
  );
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, values) => translate(lang, key, values),
      locale: lang === "he" ? "he-IL" : "en-GB",
    }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n outside I18nProvider");
  return value;
}
