// ═══════════════════════════════════════════════════════════
// لایه Domain — انواع، ثابت‌ها و برچسب‌های فارسی
// مطابق FR-02 (نوع فعالیت/عنصر)، FR-11 (وضعیت مشاهده)، ۷.۲ (وضعیت مراحل)
// ═══════════════════════════════════════════════════════════

// ── نوع رویداد فرایندی فعالیت — FR-02 ──
export const PROCESS_TYPES = ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE'] as const
export type ProcessType = (typeof PROCESS_TYPES)[number]

export const PROCESS_TYPE_LABELS: Record<ProcessType, string> = {
  OPERATION: 'عملیات',
  INSPECTION: 'بازرسی',
  TRANSPORT: 'حمل‌ونقل',
  DELAY: 'تأخیر',
  STORAGE: 'انبارش',
}

export const PROCESS_TYPE_SYMBOLS: Record<ProcessType, string> = {
  OPERATION: '○',
  INSPECTION: '□',
  TRANSPORT: '⇨',
  DELAY: 'D',
  STORAGE: '▽',
}

// ── نوع عنصر کاری — FR-02 ──
export const ELEMENT_TYPES = ['MANUAL', 'MACHINE', 'WAITING', 'OVERLAP'] as const
export type ElementType = (typeof ELEMENT_TYPES)[number]

export const ELEMENT_TYPE_LABELS: Record<ElementType, string> = {
  MANUAL: 'دستی',
  MACHINE: 'خودکار ماشین',
  WAITING: 'انتظار',
  OVERLAP: 'هم‌زمان / دارای هم‌پوشانی',
}

// ── روش اندازه‌گیری — FR-06 ──
export const TIMING_METHODS = ['SNAPBACK', 'CONTINUOUS'] as const
export type TimingMethod = (typeof TIMING_METHODS)[number]

export const TIMING_METHOD_LABELS: Record<TimingMethod, string> = {
  SNAPBACK: 'برگشت به صفر (Snapback)',
  CONTINUOUS: 'پیوسته (Continuous)',
}

// ── وضعیت جلسه — FR-06 (جلسه بسته = فقط‌خواندنی؛ جلسه جدید لازم است) ──
export const SESSION_STATUSES = ['OPEN', 'CLOSED'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  OPEN: 'باز (قابل ثبت داده)',
  CLOSED: 'بسته (فقط‌خواندنی)',
}

// ── وضعیت مشاهده — FR-11 ──
export const VALIDITY_STATUSES = ['VALID', 'SUSPECT', 'EXCLUDED', 'INVALID'] as const
export type ValidityStatus = (typeof VALIDITY_STATUSES)[number]

export const VALIDITY_STATUS_LABELS: Record<ValidityStatus, string> = {
  VALID: 'معتبر برای محاسبات',
  SUSPECT: 'مشکوک و نیازمند بازبینی',
  EXCLUDED: 'خارج‌شده از محاسبات به انتخاب کاربر',
  INVALID: 'ناقص / نامعتبر',
}

// ── روش اعمال مجاز — FR-15 ──
export const ALLOWANCE_METHODS = ['PERCENT_OF_NT', 'SHARE_OF_ST'] as const
export type AllowanceMethod = (typeof ALLOWANCE_METHODS)[number]

export const ALLOWANCE_METHOD_LABELS: Record<AllowanceMethod, string> = {
  PERCENT_OF_NT: 'مجاز به‌صورت درصدی از زمان نرمال',
  SHARE_OF_ST: 'مجاز به‌صورت سهمی از زمان استاندارد',
}

export const ALLOWANCE_METHOD_FORMULAS: Record<AllowanceMethod, string> = {
  PERCENT_OF_NT: 'ST = NT × (1 + A)',
  // قید A < ۱۰۰٪ جداگانه و راست‌به‌چپ زیر فرمول نمایش داده می‌شود (تردید جهت متن نمی‌ماند)
  SHARE_OF_ST: 'ST = NT / (1 − A)',
}

// ── مدل جدید الونس‌ها — جلسه اول بازطراحی ──

/** سطوح تخصیص الونس — PROJECT همان سطح خط تولید است (§۲.۱) */
export const ALLOWANCE_SCOPES = ['PROJECT', 'STATION', 'ACTIVITY', 'WORK_ELEMENT'] as const
export type AllowanceScopeType = (typeof ALLOWANCE_SCOPES)[number]

export const ALLOWANCE_SCOPE_LABELS: Record<AllowanceScopeType, string> = {
  PROJECT: 'خط تولید (پروژه)',
  STATION: 'ایستگاه',
  ACTIVITY: 'فعالیت',
  WORK_ELEMENT: 'عنصر کاری',
}

/** حالت تخصیص: مقدار فعال یا حذف از ارث‌بری */
export const ALLOWANCE_MODES = ['ACTIVE', 'EXCLUDE'] as const
export type AllowanceMode = (typeof ALLOWANCE_MODES)[number]

/** نوع مقدار الونس */
export const ALLOWANCE_VALUE_TYPES = ['PERCENT', 'FIXED_TIME'] as const
export type AllowanceValueType = (typeof ALLOWANCE_VALUE_TYPES)[number]

export const ALLOWANCE_VALUE_TYPE_LABELS: Record<AllowanceValueType, string> = {
  PERCENT: 'درصدی',
  FIXED_TIME: 'زمان ثابت',
}

/** مبنای وقوع زمان ثابت (§۲.۳) */
export const ALLOWANCE_BASES = ['PER_ELEMENT_EXECUTION', 'PER_CYCLE'] as const
export type AllowanceBasis = (typeof ALLOWANCE_BASES)[number]

export const ALLOWANCE_BASIS_LABELS: Record<AllowanceBasis, string> = {
  PER_ELEMENT_EXECUTION: 'به‌ازای هر اجرای عنصر',
  PER_CYCLE: 'یک‌بار در هر چرخه',
}

/** وضعیت ارث‌بری مقدار مؤثر (§۲.۴) */
export const ALLOWANCE_STATUSES = ['INHERITED', 'OVERRIDDEN', 'CUSTOM', 'EXCLUDED'] as const
export type AllowanceStatus = (typeof ALLOWANCE_STATUSES)[number]

export const ALLOWANCE_STATUS_LABELS: Record<AllowanceStatus, string> = {
  INHERITED: 'ارث‌رسیده',
  OVERRIDDEN: 'جایگزین‌شده',
  CUSTOM: 'اختصاصی',
  EXCLUDED: 'حذف‌شده از ارث‌بری',
}

/** سقف مجاز زمان ثابت (ثانیه) — محافظ مهندسی در برابر خطای داده */
export const MAX_FIXED_TIME_SECONDS = 86_400

// ── روش تجمیع چند اپراتور — ۱۰.۱ ──
export const AGGREGATION_METHODS = ['WEIGHTED_BY_COUNT', 'EQUAL_OPERATOR_MEAN'] as const
export type AggregationMethod = (typeof AGGREGATION_METHODS)[number]

export const AGGREGATION_METHOD_LABELS: Record<AggregationMethod, string> = {
  WEIGHTED_BY_COUNT: 'میانگین وزنی بر اساس تعداد مشاهدات معتبر (پیش‌فرض)',
  EQUAL_OPERATOR_MEAN: 'میانگین اپراتورها با وزن برابر',
}

// ── وضعیت پروژه ──
export const PROJECT_STATUSES = ['DRAFT', 'IN_PROGRESS', 'FINALIZED'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'پیش‌نویس',
  IN_PROGRESS: 'در حال انجام',
  FINALIZED: 'نهایی‌شده',
}

// ── وضعیت چهارگانه مراحل — ۷.۲ ──
export const STAGE_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'NEEDS_REVIEW'] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  PENDING: 'انجام‌نشده',
  IN_PROGRESS: 'در حال انجام',
  DONE: 'تکمیل‌شده',
  NEEDS_REVIEW: 'نیازمند بررسی',
}

// ── فازهای توسعه (صرفاً ترتیب توسعه، نه حذف قابلیت) ──
export const DEVELOPMENT_PHASES: Record<string, number> = {
  timing: 3,
  analysis: 4,
  charts: 5,
  dashboard: 6,
  reports: 6,
}

// ── مراحل مطالعه در سایدبار پروژه ──
export const STUDY_STAGES = [
  { key: 'info', label: 'مشخصات پروژه', desc: 'نام، خط تولید، محصول و تنظیمات محاسبات' },
  { key: 'structure', label: 'ساختار تولید', desc: 'ایستگاه‌ها، فعالیت‌ها و عناصر کاری' },
  { key: 'operators', label: 'اپراتورها', desc: 'معرفی اپراتورهای شرکت‌کننده در مطالعه' },
  { key: 'allowances', label: 'مجازها و الونس‌ها', desc: 'تعریف مرکزی الونس، تخصیص سلسله‌مراتبی و گروه‌های فعالیت' },
  { key: 'westinghouse', label: 'ارزیابی وستینگهاوس', desc: 'جدول مرجع و ارزیابی عناصر کاری' },
  { key: 'timing', label: 'زمان‌سنجی', desc: 'جلسه، جدول چرخه‌محور، Paste از Excel' },
  { key: 'analysis', label: 'تحلیل نتایج', desc: 'آمار، داده غیرعادی و مقایسه اپراتورها' },
  { key: 'charts', label: 'نمودار فرایند', desc: 'OPC و FPC با گره‌های فعالیت' },
  { key: 'dashboard', label: 'داشبورد', desc: 'کارت‌های خلاصه و شاخص‌های تخصصی' },
  { key: 'reports', label: 'گزارش‌ها', desc: 'خروجی Excel و PDF رسمی' },
] as const

export type StageKey = (typeof STUDY_STAGES)[number]['key']

export const STAGE_KEYS = STUDY_STAGES.map((s) => s.key) as StageKey[]

// ── عوامل وستینگهاوس ──
export const RATING_FACTORS = ['SKILL', 'EFFORT', 'CONDITIONS', 'CONSISTENCY'] as const
export type RatingFactor = (typeof RATING_FACTORS)[number]

export const RATING_FACTOR_LABELS: Record<RatingFactor, string> = {
  SKILL: 'مهارت',
  EFFORT: 'تلاش',
  CONDITIONS: 'شرایط',
  CONSISTENCY: 'یکنواختی',
}

// ── کلیدهای تنظیمات پروژه ──
export const PROJECT_SETTING_KEYS = {
  allowanceMethod: 'calc.allowanceMethod',
  aggregationMethod: 'calc.aggregationMethod',
  dashboardLayout: 'dash.layout',
} as const

export const DEFAULT_PROJECT_SETTINGS: Record<string, string> = {
  'calc.allowanceMethod': 'PERCENT_OF_NT',
  'calc.aggregationMethod': 'WEIGHTED_BY_COUNT',
}

// ── کلیدهای تنظیمات سراسری ──
export const APP_SETTING_DEFAULTS: Record<string, string> = {
  'ui.language': 'fa',
  'ui.calendar': 'jalali', // jalali | gregorian
  'ui.digits': 'persian', // persian | latin
  'ui.decimals': '2', // ارقام اعشار نمایش — ۸.۱
  'backup.autoEnabled': 'true',
  'backup.intervalMinutes': '30',
  'backup.retention': '10',
  'outlier.method': 'mad', // mad | iqr
  'outlier.threshold': '3.5',
}

// ── فرمول‌های حیاتی — بخش ۸ PRD ──
export const FORMULA_VERSION = '1.0.0'

export const FORMULAS = {
  ratingFactor: 'R = 1 + Skill + Effort + Conditions + Consistency',
  normalTime: 'NT = OT × R',
  standardTimeM1: 'ST = NT × (1 + A)',
  standardTimeM2: 'ST = NT / (1 − A)',
  continuousElement: 'زمان عنصر = قرائت تجمعی فعلی − قرائت تجمعی قبلی (در همان خط زمانی)',
  parallelDuration: 'مدت بازه = پایان − شروع',
  elapsedCycle: 'زمان سپری‌شده چرخه = دیرترین پایان − زودترین شروع',
} as const

// ── حالت نمایش اعداد و تاریخ ──
export type CalendarMode = 'jalali' | 'gregorian'
export type DigitsMode = 'persian' | 'latin'

// ── خطاهای ساختاریافته API ──
export class AppError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}
