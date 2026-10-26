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
  "common.back": "חזרה",
  "common.retry": "לנסות שוב",
  "common.demo": "דמו",
  "home.upload": "העלאת קובץ ייצוא",
  "home.demo": "נסו על נתוני דמו",
  "home.demoHint": "כל המסלול על נתונים מדומים שלנו, כדי לראות איך זה עובד לפני שמעלים את שלכם.",
  "home.current": "בתהליך",
  "home.currentOpen": "לצפייה",
  "home.latest": "התוצאה האחרונה",
  "home.latestOpen": "לתוצאות",
  "home.accounts": "{count} לקוחות נבדקו",
  "home.atRisk": "{count} בסיכון גבוה",
  "upload.title": "העלאת קובץ ייצוא",
  "upload.lead":
    "קובץ דחוס (zip) עם הטבלאות ממערכת הנוכחות שלכם: אקסל או קבצי טקסט, בכל מבנה. עד גיגה.",
  "upload.choose": "בחירת קובץ",
  "upload.drop": "או גררו את הקובץ לכאן",
  "upload.send": "העלאת הקובץ",
  "upload.cancel": "ביטול ההעלאה",
  "upload.notZip": "צריך קובץ דחוס (zip).",
  "upload.tooLarge": "הקובץ גדול מגיגה.",
  "upload.privacy":
    "עמודות אישיות (שמות עובדים, תעודות זהות, טלפונים) לא נשמרות. הקובץ המקורי נמחק אחרי הקליטה.",
  "steps.upload": "העלאה",
  "steps.read": "קריאת הקובץ",
  "steps.review": "אישור ההתאמה",
  "steps.prepare": "הכנת הנתונים",
  "steps.run": "בניית המודל",
  "queue.waiting": "ממתין בתור: {count} לפניכם.",
  "ingestion.reading": "קוראים את הקובץ ומזהים את הטבלאות…",
  "ingestion.preparing": "מכינים את הנתונים ובודקים שיש מספיק היסטוריה…",
  "ingestion.failed": "לא הצלחנו לקלוט את הקובץ",
  "ingestion.discarded": "ההעלאה בוטלה.",
  "ingestion.another": "העלאת קובץ אחר",
  "review.title": "כך הבנו את הקובץ שלכם",
  "review.lead":
    "בדקו את הסיכום. אפשר לתקן רק את מה שמסומן. אחרי האישור נכין את הנתונים ונבנה את המודל.",
  "review.groups": "קבוצות נתונים",
  "review.present": "יש",
  "review.missing": "חסר",
  "review.tables": "הטבלאות",
  "review.table": "אצלנו",
  "review.source": "אצלכם",
  "review.rows": "שורות",
  "review.columns": "עמודות שזוהו",
  "review.flagged": "לבדיקה שלכם",
  "review.flaggedNone": "הכול זוהה בוודאות.",
  "review.uncertain": "לא בטוח",
  "review.missingColumn": "חסר",
  "review.withTime": "יחד עם {column}",
  "review.noSource": "אין עמודה כזו",
  "review.values": "ערכים שלא זיהינו",
  "review.keep": "להשאיר כמו שהוא",
  "review.ignored": "עמודות שלא נשמרות",
  "review.ignoredHint": "לא נקלטות בכלל, כולל העמודות האישיות.",
  "review.notes": "הערות טכניות",
  "review.blocking": "חסרות עמודות חובה: {columns}. בחרו להן עמודה כדי להמשיך.",
  "review.approve": "אישור והמשך",
  "review.discard": "ביטול ההעלאה",
  "run.title": "בונים את המודל",
  "run.stage": "שלב {done} מתוך {total}: {stage}",
  "run.done": "המודל מוכן",
  "run.failed": "ההרצה לא הצליחה",
  "run.accounts": "לקוחות נבדקו",
  "run.high": "בסיכון גבוה",
  "run.elevated": "בסיכון מוגבר",
  "run.normal": "רגיל",
  "run.snapshot": "נכון ל-{date}",
  "run.resultsSoon": "מסך התוצאות המלא מגיע בקרוב.",
  "error.archive_too_large": "הקובץ גדול מ-{max_mb} מגה.",
  "error.archive_not_zip": "זה לא קובץ דחוס (zip) תקין.",
  "error.archive_too_many_files": "יש בקובץ {count} קבצים, ואפשר עד {max}.",
  "error.archive_unsafe_path": "בקובץ יש נתיב לא בטוח: {file}.",
  "error.archive_symlink": "בקובץ יש קישור, ואי אפשר לקלוט אותו: {file}.",
  "error.archive_nested": "בקובץ יש קובץ דחוס נוסף: {file}. צריך לפרוס אותו קודם.",
  "error.archive_ratio": "הקובץ {file} דחוס בצורה חשודה.",
  "error.archive_too_big": "אחרי פריסה הקובץ גדול מ-{max_gb} גיגה.",
  "error.archive_size_mismatch": "הקובץ {file} פגום.",
  "error.archive_no_readable_files": "לא מצאנו בקובץ טבלאות (אקסל או קבצי טקסט).",
  "error.export_unreadable": "לא הצלחנו לקרוא את אחת הטבלאות. בדקו שהקבצים לא פגומים.",
  "error.core_groups_missing": "חסרים נתונים שאי אפשר בלעדיהם: {groups}.",
  "error.unknown_groups": "קבוצות נתונים לא מוכרות: {groups}.",
  "error.no_activity_dates": "אין בקובץ תאריכי החתמות או שימוש, ולכן אי אפשר לדעת עד מתי הוא.",
  "error.no_billing_periods": "אין בקובץ חודשי חיוב, ולכן אי אפשר לדעת ממתי ההיסטוריה.",
  "error.not_enough_history":
    "אין מספיק היסטוריה: צריך לפחות {need_train} ביטולים ללמידה ו-{need_test} לבדיקה.",
  "error.required_column_missing": "חסרה עמודת חובה: {column}.",
  "error.mapping_not_approved": "ההתאמה עוד לא אושרה.",
  "error.mapping_incomplete": "חסרות עמודות חובה.",
  "error.invalid_edit": "אי אפשר לבצע את השינוי הזה.",
  "error.upload_too_large": "הקובץ גדול מ-{max_mb} מגה.",
  "error.upload_not_zip": "צריך קובץ דחוס (zip).",
  "error.upload_empty": "הקובץ ריק.",
  "error.upload_interrupted": "ההעלאה נקטעה. נסו שוב.",
  "error.ingestion_in_flight": "יש כבר העלאה או הרצה בתהליך. חכו שתסתיים.",
  "error.not_reviewable": "את ההעלאה הזו כבר אי אפשר לשנות.",
  "error.not_retryable": "את ההרצה הזו אי אפשר להריץ שוב.",
  "error.demo_unavailable": "הדמו זמין רק לפני שמעלים נתונים אמיתיים.",
  "error.pipeline_failed": "ההרצה נעצרה בשלב: {stage}.",
  "error.llm_quota": "מכסת מודל השפה נגמרה. נסו שוב מאוחר יותר.",
  "error.pipeline_crashed": "ההרצה נכשלה בגלל תקלה אצלנו. אנחנו בודקים.",
  "error.run_timeout": "ההרצה לקחה יותר מדי זמן.",
  "error.step_timeout": "קריאת הקובץ לקחה יותר מדי זמן.",
  "error.out_of_memory": "הקובץ גדול מדי בשבילנו כרגע.",
  "error.worker_lost": "העיבוד נקטע. נסו שוב.",
  "error.interrupted": "העיבוד נקטע. נסו שוב.",
  "error.internal": "משהו השתבש אצלנו. נסו שוב, ואם זה חוזר, כתבו לנו.",
} as const;

export type Key = keyof typeof he;

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
  "common.back": "Back",
  "common.retry": "Try again",
  "common.demo": "Demo",
  "home.upload": "Upload an export",
  "home.demo": "Try on demo data",
  "home.demoHint":
    "The whole path on our synthetic data, to see how it works before you upload yours.",
  "home.current": "In progress",
  "home.currentOpen": "View",
  "home.latest": "Latest result",
  "home.latestOpen": "See results",
  "home.accounts": "{count} accounts scored",
  "home.atRisk": "{count} at high risk",
  "upload.title": "Upload an export",
  "upload.lead":
    "A zip file with the tables from your time-attendance system: Excel or text files, in any structure. Up to 1 GB.",
  "upload.choose": "Choose a file",
  "upload.drop": "or drop it here",
  "upload.send": "Upload the file",
  "upload.cancel": "Cancel the upload",
  "upload.notZip": "It has to be a zip file.",
  "upload.tooLarge": "The file is larger than 1 GB.",
  "upload.privacy":
    "Personal columns (employee names, ID numbers, phones) are never kept. The original file is deleted once it is read.",
  "steps.upload": "Upload",
  "steps.read": "Reading the file",
  "steps.review": "Approve the mapping",
  "steps.prepare": "Preparing the data",
  "steps.run": "Building the model",
  "queue.waiting": "Waiting in line: {count} ahead of you.",
  "ingestion.reading": "Reading the file and finding the tables…",
  "ingestion.preparing": "Preparing the data and checking there is enough history…",
  "ingestion.failed": "We could not read the file",
  "ingestion.discarded": "The upload was cancelled.",
  "ingestion.another": "Upload another file",
  "review.title": "This is how we read your file",
  "review.lead":
    "Check the summary. Only the flagged items can be changed. Once you approve, we prepare the data and build the model.",
  "review.groups": "Data groups",
  "review.present": "Found",
  "review.missing": "Missing",
  "review.tables": "Tables",
  "review.table": "Ours",
  "review.source": "Yours",
  "review.rows": "Rows",
  "review.columns": "Columns found",
  "review.flagged": "For you to check",
  "review.flaggedNone": "Everything was recognised with certainty.",
  "review.uncertain": "Not sure",
  "review.missingColumn": "Missing",
  "review.withTime": "with {column}",
  "review.noSource": "No such column",
  "review.values": "Values we did not recognise",
  "review.keep": "Keep as written",
  "review.ignored": "Columns not kept",
  "review.ignoredHint": "Never stored, the personal ones included.",
  "review.notes": "Technical notes",
  "review.blocking": "Required columns are missing: {columns}. Pick a column for each to continue.",
  "review.approve": "Approve and continue",
  "review.discard": "Cancel the upload",
  "run.title": "Building the model",
  "run.stage": "Step {done} of {total}: {stage}",
  "run.done": "The model is ready",
  "run.failed": "The run did not succeed",
  "run.accounts": "Accounts scored",
  "run.high": "High risk",
  "run.elevated": "Elevated risk",
  "run.normal": "Normal",
  "run.snapshot": "As of {date}",
  "run.resultsSoon": "The full results screen is coming soon.",
  "error.archive_too_large": "The file is larger than {max_mb} MB.",
  "error.archive_not_zip": "This is not a valid zip file.",
  "error.archive_too_many_files": "The file holds {count} files; at most {max}.",
  "error.archive_unsafe_path": "The file holds an unsafe path: {file}.",
  "error.archive_symlink": "The file holds a link, which cannot be read: {file}.",
  "error.archive_nested": "The file holds another zip: {file}. Unzip it first.",
  "error.archive_ratio": "{file} is compressed suspiciously.",
  "error.archive_too_big": "Unzipped, the file is larger than {max_gb} GB.",
  "error.archive_size_mismatch": "{file} is damaged.",
  "error.archive_no_readable_files": "We found no tables in the file (Excel or text files).",
  "error.export_unreadable":
    "We could not read one of the tables. Check that the files are not damaged.",
  "error.core_groups_missing": "Data we cannot do without is missing: {groups}.",
  "error.unknown_groups": "Unknown data groups: {groups}.",
  "error.no_activity_dates":
    "The file has no punch or usage dates, so we cannot tell when it ends.",
  "error.no_billing_periods":
    "The file has no billing months, so we cannot tell when the history starts.",
  "error.not_enough_history":
    "Not enough history: we need at least {need_train} cancellations to learn from and {need_test} to test on.",
  "error.required_column_missing": "A required column is missing: {column}.",
  "error.mapping_not_approved": "The mapping is not approved yet.",
  "error.mapping_incomplete": "Required columns are missing.",
  "error.invalid_edit": "That change is not possible.",
  "error.upload_too_large": "The file is larger than {max_mb} MB.",
  "error.upload_not_zip": "It has to be a zip file.",
  "error.upload_empty": "The file is empty.",
  "error.upload_interrupted": "The upload was interrupted. Please try again.",
  "error.ingestion_in_flight": "An upload or a run is already in progress. Wait for it to finish.",
  "error.not_reviewable": "This upload can no longer be changed.",
  "error.not_retryable": "This run cannot be run again.",
  "error.demo_unavailable": "The demo is only available before you upload real data.",
  "error.pipeline_failed": "The run stopped at: {stage}.",
  "error.llm_quota": "The language model's quota ran out. Please try again later.",
  "error.pipeline_crashed":
    "The run failed because of a problem on our side. We are looking into it.",
  "error.run_timeout": "The run took too long.",
  "error.step_timeout": "Reading the file took too long.",
  "error.out_of_memory": "The file is too large for us right now.",
  "error.worker_lost": "Processing was interrupted. Please try again.",
  "error.interrupted": "Processing was interrupted. Please try again.",
  "error.internal":
    "Something went wrong on our side. Try again, and write to us if it happens again.",
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
