// Names of our data, in Hebrew and English: tables, columns, enum values, data groups, the
// pipeline's stages, risk levels and the reasons behind a score. Anything not listed falls back
// to its technical name, so a new column shows up, just not translated.
import type { Lang } from "./i18n";

type Names = Record<string, [he: string, en: string]>;

const TABLES: Names = {
  accounts: ["לקוחות", "Accounts"],
  billing_monthly: ["חיוב חודשי", "Monthly billing"],
  employees: ["עובדים", "Employees"],
  sites: ["אתרים", "Sites"],
  punches: ["החתמות", "Punches"],
  shifts: ["משמרות", "Shifts"],
  absence_requests: ["בקשות היעדרות", "Absence requests"],
  hours_daily: ["שעות יומיות", "Daily hours"],
  payroll_exports: ["הפקות שכר", "Payroll exports"],
  usage_daily: ["שימוש יומי", "Daily usage"],
  devices: ["שעונים", "Devices"],
  device_health_daily: ["תקינות שעונים", "Device health"],
  wages: ["שכר", "Wages"],
};

const COLUMNS: Names = {
  account_id: ["מספר לקוח", "Account number"],
  account_name: ["שם הלקוח", "Account name"],
  employee_id: ["מספר עובד", "Employee number"],
  site_id: ["מספר אתר", "Site number"],
  device_id: ["מספר שעון", "Device number"],
  signed_up_at: ["תאריך הצטרפות", "Signed up"],
  cancelled_at: ["תאריך ביטול", "Cancelled"],
  industry: ["ענף", "Industry"],
  region: ["אזור", "Region"],
  period: ["חודש", "Month"],
  plan: ["מסלול", "Plan"],
  seats: ["מספר רישיונות", "Seats"],
  mrr: ["הכנסה חודשית", "Monthly revenue"],
  paid_at: ["תאריך תשלום", "Paid"],
  hired_at: ["תאריך קליטה", "Hired"],
  punched_at: ["זמן ההחתמה", "Punch time"],
  method: ["אמצעי החתמה", "Punch method"],
  direction: ["כניסה או יציאה", "In or out"],
  planned_start: ["תחילת משמרת מתוכננת", "Planned start"],
  planned_end: ["סוף משמרת מתוכנן", "Planned end"],
  outcome: ["תוצאת המשמרת", "Shift outcome"],
  kind: ["סוג היעדרות", "Absence type"],
  start_date: ["תאריך התחלה", "Start date"],
  end_date: ["תאריך סיום", "End date"],
  requested_at: ["תאריך הבקשה", "Requested"],
  decided_at: ["תאריך ההחלטה", "Decided"],
  decision: ["החלטה", "Decision"],
  edited_by: ["נערך על ידי", "Edited by"],
  work_date: ["תאריך עבודה", "Work date"],
  regular_hours: ["שעות רגילות", "Regular hours"],
  exported_at: ["תאריך הפקה", "Exported"],
  payroll_software: ["תוכנת שכר", "Payroll software"],
  usage_date: ["תאריך", "Date"],
  admin_logins: ["כניסות מנהלים", "Admin logins"],
  installed_at: ["תאריך התקנה", "Installed"],
  health_date: ["תאריך", "Date"],
  offline_hours: ["שעות ללא חיבור", "Hours offline"],
  effective_from: ["בתוקף מ", "Effective from"],
  hourly_rate: ["שכר לשעה", "Hourly rate"],
};

const VALUES: Names = {
  app: ["אפליקציה", "App"],
  nfc: ["כרטיס או תג", "Card or tag"],
  biometric: ["ביומטרי", "Biometric"],
  web: ["אתר", "Web"],
  in: ["כניסה", "In"],
  out: ["יציאה", "Out"],
  worked: ["בוצעה", "Worked"],
  open: ["פתוחה", "Open"],
  late: ["איחור", "Late"],
  no_show: ["לא הגיע", "No show"],
  swapped: ["הוחלפה", "Swapped"],
  sick: ["מחלה", "Sick"],
  vacation: ["חופשה", "Vacation"],
  unpaid: ["ללא תשלום", "Unpaid"],
  other: ["אחר", "Other"],
  approved: ["אושרה", "Approved"],
  rejected: ["נדחתה", "Rejected"],
};

const GROUPS: Names = {
  commercial: ["לקוחות וחיוב", "Accounts and billing"],
  organisation: ["עובדים ואתרים", "Employees and sites"],
  punches: ["החתמות", "Punches"],
  shifts: ["משמרות", "Shifts"],
  absences: ["היעדרויות", "Absences"],
  hours: ["שעות", "Hours"],
  payroll: ["שכר והפקות", "Payroll"],
  usage: ["שימוש במערכת", "System usage"],
  devices: ["שעונים", "Devices"],
  money: ["תעריפי שכר", "Wage rates"],
};

export const STAGES = [
  "check_inputs",
  "run_analyst_stage",
  "gate_contract",
  "run_feature_phase",
  "gate_required_features",
  "run_modeling_phase",
  "gate_artifacts",
  "promote_and_finish",
] as const;

const STAGE_NAMES: Names = {
  prepare_run: ["מכינים את ההרצה", "Preparing the run"],
  check_inputs: ["בודקים את הקבצים", "Checking the files"],
  run_analyst_stage: ["מנקים ומסכמים את הנתונים", "Cleaning and summarising the data"],
  gate_contract: ["בדיקת איכות הנתונים", "Data quality check"],
  run_feature_phase: ["מחשבים מדדים לכל לקוח", "Computing each account's signals"],
  gate_required_features: ["בדיקת המדדים", "Signals check"],
  run_modeling_phase: ["מאמנים ובוחרים מודל", "Training and choosing a model"],
  gate_artifacts: ["בדיקת התוצאות", "Results check"],
  promote_and_finish: ["מסיימים", "Finishing"],
};

const RISK: Names = {
  high: ["סיכון גבוה", "High risk"],
  elevated: ["סיכון מוגבר", "Elevated risk"],
  normal: ["סיכון רגיל", "Normal"],
};

const REASONS: Names = {
  punch_activity: ["ירידה בהחתמות", "Fewer punches"],
  active_employees: ["פחות עובדים פעילים", "Fewer active employees"],
  admin_logins: ["פחות כניסות מנהלים", "Fewer admin logins"],
  payroll_exports: ["הפסיקו להפיק שכר", "Payroll exports stopped"],
  modules: ["פחות מודולים בשימוש", "Fewer modules in use"],
  seats: ["פחות רישיונות", "Fewer seats"],
  billing: ["בעיות חיוב", "Billing issues"],
  overtime: ["שינוי בשעות נוספות", "Overtime change"],
  support: ["פניות תמיכה", "Support tickets"],
  punch_edits: ["הרבה תיקוני החתמות", "Many punch edits"],
  engagement: ["פחות מעורבות", "Less engagement"],
  tenure: ["ותק קצר", "Short tenure"],
  // a feature with no family of its own is its own code; neutral words, the tooltip shows which way
  industry: ["ענף", "Industry"],
  region: ["אזור", "Region"],
  plan: ["מסלול", "Plan"],
  mrr: ["הכנסה חודשית", "Monthly revenue"],
  active_sites: ["אתרים פעילים", "Active sites"],
  employees_joined: ["עובדים שהצטרפו", "Employees joined"],
  employees_left: ["עובדים שעזבו", "Employees who left"],
  sites_closed: ["אתרים שנסגרו", "Sites closed"],
  app_punch_share: ["החתמות מהאפליקציה", "Punches from the app"],
  shifts_planned: ["משמרות מתוכננות", "Planned shifts"],
  no_show_rate: ["אי-הגעה למשמרות", "Shift no-shows"],
  open_shift_share: ["משמרות לא מאוישות", "Unfilled shifts"],
  schedule_lead_days: ["פרסום הסידור מראש", "Schedule lead time"],
  absence_requests: ["בקשות היעדרות", "Absence requests"],
  pending_request_days: ["זמן המתנה לבקשות", "Request waiting time"],
  sick_days_per_employee: ["ימי מחלה לעובד", "Sick days per employee"],
  rest_violations: ["הפרות מנוחה", "Rest violations"],
  payroll_corrections: ["תיקונים אחרי הפקת שכר", "Corrections after payroll"],
  app_install_share: ["התקנות האפליקציה", "App installs"],
  devices_total: ["שעונים מותקנים", "Installed devices"],
  device_offline_hours: ["שעות שעון מנותק", "Device offline hours"],
  device_failure_rate: ["כשלי זיהוי בשעון", "Device recognition failures"],
  data_gap: ["פער בנתוני השעונים", "Device data gap"],
  labor_cost: ["עלות שכר", "Labor cost"],
};

function pick(names: Names, key: string, lang: Lang): string {
  const found = names[key];
  return found ? found[lang === "he" ? 0 : 1] : key;
}

export const label = {
  table: (key: string, lang: Lang) => pick(TABLES, key, lang),
  column: (key: string, lang: Lang) => pick(COLUMNS, key, lang),
  value: (key: string, lang: Lang) => pick(VALUES, key, lang),
  group: (key: string, lang: Lang) => pick(GROUPS, key, lang),
  stage: (key: string, lang: Lang) => pick(STAGE_NAMES, key, lang),
  risk: (key: string, lang: Lang) => pick(RISK, key, lang),
  reason: (key: string, lang: Lang) => pick(REASONS, key, lang),
  /** The words for the codes the copilot's tools return (reasons, levels, data groups), so its
   * answer uses the screen's words: "reason.billing" -> "בעיות חיוב". */
  glossary: (lang: Lang): Record<string, string> =>
    Object.fromEntries(
      (
        [
          ["reason", REASONS],
          ["level", RISK],
          ["group", GROUPS],
        ] as const
      ).flatMap(([kind, names]) =>
        Object.keys(names).map((key) => [`${kind}.${key}`, pick(names, key, lang)]),
      ),
    ),
};
