// The demo's own words, in both languages: what it explains along the way, and the few of the site's
// strings that speak of a server or an account, said as they are here.
import { useI18n, type Key, type Lang } from "../i18n";

const he = {
  enter: "נסו את הדמו",
  code: "הקוד בגיטהאב",
  contact: "דברו איתי באקספלייס",
  company: "חברה לדוגמה",
  banner: "דמו. הכול רץ בדפדפן שלכם, והקובץ לא יוצא מהמחשב",
  bannerReady: "דמו. אלה תוצאות מוכנות של קובץ הדוגמה; ההרצה עצמה זמינה במחשב",
  guideTitle: "איך מנסים",
  step1: "מורידים קובץ לדוגמה",
  step1Body:
    "ייצוא בדוי של תוכנת נוכחות ושכר: 80 לקוחות, 11 טבלאות, שמות ועמודות כמו אצל לקוח אמיתי.",
  step2: "גוררים אותו לעיגול",
  step2Body: "או בוחרים ייצוא משלכם, קובץ zip. הקובץ נשאר במחשב.",
  step3: "מאשרים, ומחכים בערך דקה",
  step3Body: "המערכת מזהה את הטבלאות, מנקה, בונה מודל ומדרגת כל לקוח. אחר כך נפתח הדשבורד.",
  download: "הורדת קובץ הדוגמה",
  ready: "לתוצאות של קובץ הדוגמה",
  phoneTitle: "בטלפון: תוצאות מוכנות",
  phoneBody: "ההרצה צריכה מחשב. כאן אפשר לראות מה מתקבל מקובץ הדוגמה, בדשבורד האמיתי.",
  now: "מה קורה עכשיו",
  understood: "מה המערכת הבינה",
  loading: "מורידים את פייתון לדפדפן: {loaded} מתוך {total} מגה. רק בפעם הראשונה.",
  warming: "מפעילים את פייתון בדפדפן",
  read: "פותחים את הקובץ, קוראים כל טבלה, ומשווים את שמות העמודות למה שהמערכת מכירה. ככה היא מבינה מבנה שלא ראתה.",
  review:
    "אלה ההתאמות שהמערכת הציעה לבד, לפי שמות וסוגי עמודות. בודקים, מתקנים רק מה שמסומן, ומאשרים.",
  prepare:
    "מחליפים שמות ומספרי לקוח בכינויים, מסדרים תאריכים ומספרים, ובודקים שיש מספיק ביטולים בעבר כדי ללמוד מהם.",
  model:
    "מנקים, מחשבים מדדים לכל לקוח בכל חודש, מאמנים כמה מודלים על העבר, בודקים אותם על חודשים שלא ראו, ומדרגים את הלקוחות של היום. שלושה שערי בדיקה עוצרים את ההרצה אם משהו לא תקין.",
  failed: "המערכת מצפה לייצוא של תוכנת נוכחות ושכר. אפשר לראות איך זה נראה בקובץ הדוגמה.",
  recognised: "זוהו: {groups}",
  factFiles: "{files} קבצים ו-{rows} שורות נקראו",
  factTables: "{tables} טבלאות זוהו, ב-{groups} קבוצות נתונים",
  factLeftOut: "{left_out} עמודות הושמטו, בהן העמודות האישיות",
  factAccounts: "{accounts} לקוחות בקובץ",
  factCancellations: "{train} ביטולים ללמידה ו-{test} לבדיקה",
  factClean: "{rows_in} חודשי לקוח נכנסו לניקוי, {rows_out} נשארו",
  factFeatures: "{features} מדדים לכל לקוח בכל חודש",
  factModels: "{models} מודלים מושווים",
  factChosen: "נבחר המודל שהצליח יותר בבדיקה החוזרת",
  factScored: "{accounts} לקוחות דורגו, {high} בסיכון גבוה",
  noteSky:
    "כל נקודה היא לקוח. האדומות בסיכון גבוה, ושלוש הסבירות ביותר לעזוב מופיעות בשם. הסכום הוא ההכנסה החודשית מהלקוחות האדומים.",
  noteTable:
    "הרשימה לעבודה: מי, מה הסיכוי שיבטל ב-60 הימים הקרובים, ולמה. עמדו על סיבה כדי לראות את הערך אצלו לעומת הרגיל.",
  noteTrend: "כמה מהלקוחות ביטלו בכל חודש. העיגול הלבן הוא החודש האחרון שידועה לו תוצאה.",
  noteDistribution: "כמה לקוחות יש בכל טווח של סיכוי לעזוב. רוב הלקוחות אמורים להיות משמאל.",
  noteReasons: "מה משותף ללקוחות בסיכון גבוה. אם סיבה אחת חוזרת, כדאי לטפל בה ולא רק בלקוח.",
  noteData: "מה היה בקובץ ומה לא. נתון חסר לא עוצר את המערכת, רק מוריד את הדיוק.",
  hideNotes: "הסתרת ההסברים",
  showNotes: "הצגת ההסברים",
};

export type Word = keyof typeof he;

const en: Record<Word, string> = {
  enter: "Try the demo",
  code: "Code on GitHub",
  contact: "Talk to me on XPlace",
  company: "Sample company",
  banner: "Demo. Everything runs in your browser, and the file never leaves your computer",
  bannerReady: "Demo. These are the sample file’s ready results; running it needs a computer",
  guideTitle: "How to try it",
  step1: "Download a sample file",
  step1Body:
    "An invented export of a time and payroll product: 80 customers, 11 tables, named the way a real customer’s are.",
  step2: "Drop it on the circle",
  step2Body: "Or choose an export of your own, a zip file. It stays on your computer.",
  step3: "Approve, and wait about a minute",
  step3Body:
    "The system recognises the tables, cleans them, builds a model and ranks every customer. Then the dashboard opens.",
  download: "Download the sample file",
  ready: "See the sample file’s results",
  phoneTitle: "On a phone: ready results",
  phoneBody:
    "Running it needs a computer. Here you can see what the sample file gives, on the real dashboard.",
  now: "What is happening now",
  understood: "What the system understood",
  loading: "Downloading Python for the browser: {loaded} of {total} MB. The first time only.",
  warming: "Starting Python in the browser",
  read: "Opening the file, reading every table, and matching its column names to what the system knows. That is how it understands a layout it has never seen.",
  review:
    "These are the matches the system proposed by itself, from the columns’ names and types. Check them, fix only what is flagged, and approve.",
  prepare:
    "Replacing names and customer numbers with pseudonyms, sorting out dates and numbers, and checking there are enough past cancellations to learn from.",
  model:
    "Cleaning, computing signals for every customer and month, training several models on the past, testing them on months they have not seen, and ranking today’s customers. Three gates stop the run if something is wrong.",
  failed:
    "The system expects an export of a time and payroll product. The sample file shows what that looks like.",
  recognised: "Recognised: {groups}",
  factFiles: "{files} files and {rows} rows read",
  factTables: "{tables} tables recognised, in {groups} data groups",
  factLeftOut: "{left_out} columns left out, the personal ones among them",
  factAccounts: "{accounts} customers in the file",
  factCancellations: "{train} cancellations to learn from and {test} to test on",
  factClean: "{rows_in} customer-months went in, {rows_out} are left after cleaning",
  factFeatures: "{features} signals for every customer and month",
  factModels: "{models} models compared",
  factChosen: "Chosen: the model that did best in cross-validation",
  factScored: "{accounts} customers ranked, {high} at high risk",
  noteSky:
    "Every point is a customer. The red ones are at high risk, and the three most likely to leave are named. The amount is the monthly revenue of the red ones.",
  noteTable:
    "The list to work from: who, how likely they are to cancel within 60 days, and why. Hover over a reason to see their value against the usual one.",
  noteTrend:
    "The share of customers who cancelled each month. The white point is the newest month whose outcome is known.",
  noteDistribution:
    "How many customers are in each range of likelihood. Most should be on the left.",
  noteReasons:
    "What the customers at high risk have in common. A reason that repeats is worth fixing itself, not only with one customer.",
  noteData:
    "What was in the file and what was not. Missing data does not stop the system, it only costs accuracy.",
  hideNotes: "Hide the explanations",
  showNotes: "Show the explanations",
};

export const WORDS: Record<Lang, Record<Word, string>> = { he, en };

/** The site's strings that speak of a server or an account, as they are in the demo. */
export const SAID: Record<Lang, Partial<Record<Key | "error.demo_desktop_only", string>>> = {
  he: {
    "login.footer": "בלי הרשמה. רץ בדפדפן שלכם, והקובץ לא יוצא מהמחשב",
    "landing.nav.start": "הדמו",
    "rail.read.time": "כ-20 שניות",
    "rail.prepare.time": "כ-10 שניות",
    "rail.model.time": "כ-20 שניות",
    "landing.start.after": "קובץ לדוגמה מחכה בפנים, ואפשר גם להעלות ייצוא שלכם",
    "upload.lead":
      "קובץ דחוס (zip) עם הטבלאות ממערכת הנוכחות: אקסל או קבצי טקסט, בכל מבנה. בדמו עד 60 מגה.",
    "upload.privacy":
      "הקובץ נקרא בדפדפן ולא נשלח לשום מקום. עמודות אישיות (שמות עובדים, תעודות זהות, טלפונים) לא נשמרות, וסגירת הלשונית מוחקת הכול.",
    "home.demo": "הריצו על קובץ הדוגמה",
    "home.demoHint": "בלי להוריד כלום: כל המסלול על אותו קובץ לדוגמה",
    "error.internal": "משהו השתבש בדפדפן. נסו שוב, ואם זה חוזר, נסו בכרום במחשב.",
    "error.out_of_memory": "לדפדפן לא היה מספיק זיכרון לקובץ הזה. נסו את קובץ הדוגמה.",
    "error.demo_unavailable": "לא הצלחנו להביא את קובץ הדוגמה. רעננו ונסו שוב.",
    "error.demo_desktop_only": "ההרצה זמינה במחשב. כאן אפשר לראות את תוצאות קובץ הדוגמה.",
  },
  en: {
    "login.footer": "No sign-up. It runs in your browser, and the file never leaves your computer",
    "landing.nav.start": "The demo",
    "rail.read.time": "About 20 seconds",
    "rail.prepare.time": "About 10 seconds",
    "rail.model.time": "About 20 seconds",
    "landing.start.after":
      "A sample file is waiting inside, and you can upload an export of your own",
    "upload.lead":
      "A zip file with the tables from a time-attendance system: Excel or text files, in any structure. Up to 60 MB in the demo.",
    "upload.privacy":
      "The file is read in your browser and sent nowhere. Personal columns (employee names, ID numbers, phones) are not kept, and closing the tab deletes everything.",
    "home.demo": "Run the sample file",
    "home.demoHint": "Nothing to download: the whole path on the same sample file",
    "error.internal":
      "Something went wrong in the browser. Try again, and if it happens again, try Chrome on a computer.",
    "error.out_of_memory":
      "The browser did not have enough memory for this file. Try the sample file.",
    "error.demo_unavailable": "The sample file could not be fetched. Reload and try again.",
    "error.demo_desktop_only":
      "Running it needs a computer. Here you can see the sample file’s results.",
  },
};

export function useWords() {
  const { lang, locale } = useI18n();
  const number = new Intl.NumberFormat(locale);
  return (word: Word, values: Record<string, number | string | null | undefined> = {}) =>
    WORDS[lang][word].replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = values[name];
      return typeof value === "number" ? number.format(value) : String(value ?? "");
    });
}
