// ═══════════════════════════════════════════════════════════
// اعتبارسنجی سمت سرور — Zod — ۶.۸
// تمام ورودی‌ها سمت سرور اعتبارسنجی می‌شوند؛
// اعتبارسنجی Frontend به‌تنهایی کافی نیست.
// اعداد فارسی/عربی پیش از اعتبارسنجی نرمال می‌شوند (FR-07).
// ═══════════════════════════════════════════════════════════
import { z } from 'zod'
import { parseNumber } from '@/lib/persian'
import {
  PROCESS_TYPES,
  ELEMENT_TYPES,
  PROJECT_STATUSES,
  ALLOWANCE_METHODS,
  AGGREGATION_METHODS,
  RATING_FACTORS,
  TIMING_METHODS,
  SESSION_STATUSES,
  VALIDITY_STATUSES,
  ALLOWANCE_VALUE_TYPES,
  ALLOWANCE_MODES,
  ALLOWANCE_BASES,
  MAX_FIXED_TIME_SECONDS,
} from './types'

/** پیش‌پردازنده عدد: رشته فارسی/عربی → number (نامعتبر → undefined برای فیلد اختیاری) */
const numberFromString = (opts?: { min?: number; max?: number }) =>
  z.preprocess((v) => {
    if (v === null || v === undefined || v === '') return undefined
    const n = parseNumber(v as string | number)
    if (Number.isNaN(n)) return Number.NaN // باعث خطای invalid_type می‌شود
    return n
  }, z.number({ message: 'مقدار عددی معتبر وارد کنید (ارقام فارسی یا لاتین)' }).refine(
    (n) => Number.isFinite(n),
    { message: 'مقدار عددی معتبر وارد کنید' }
  ).refine((n) => opts?.min === undefined || n >= opts.min, {
    message: `مقدار باید بزرگ‌تر یا مساوی ${opts?.min} باشد`,
  }).refine((n) => opts?.max === undefined || n <= opts.max, {
    message: `مقدار باید کوچک‌تر یا مساوی ${opts?.max} باشد`,
  }))

const optionalNumber = (opts?: { min?: number; max?: number }) =>
  z.preprocess((v) => {
    if (v === null || v === undefined || v === '') return null
    const n = parseNumber(v as string | number)
    return Number.isNaN(n) ? Number.NaN : n
  }, z.number().refine((n) => Number.isFinite(n), { message: 'مقدار عددی معتبر وارد کنید' })
    .refine((n) => opts?.min === undefined || n >= opts.min, { message: `مقدار باید ≥ ${opts?.min} باشد` })
    .refine((n) => opts?.max === undefined || n <= opts.max, { message: `مقدار باید ≤ ${opts?.max} باشد` })
    .nullable())

const trimmed = (max: number, min = 1) => z.string().trim().min(min, 'این فیلد الزامی است').max(max, `حداکثر ${max} نویسه`)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// ── پروژه — FR-01 ──
export const projectCreateSchema = z.object({
  name: trimmed(200),
  lineName: trimmed(200),
  productName: trimmed(200),
  studyDate: z.string().regex(ISO_DATE, 'تاریخ مطالعه معتبر نیست').nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
})

export const projectUpdateSchema = z.object({
  name: trimmed(200).optional(),
  lineName: trimmed(200).optional(),
  productName: trimmed(200).optional(),
  studyDate: z.string().regex(ISO_DATE, 'تاریخ مطالعه معتبر نیست').nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  expectedUpdatedAt: z.string().datetime().optional(), // کنترل هم‌زمانی — ۶.۶
})

// ── کپی پروژه — FR-01 ──
export const projectDuplicateSchema = z.object({
  newProjectName: trimmed(200),
  include: z.object({
    structure: z.boolean().default(true), // ایستگاه‌ها/فعالیت‌ها/عناصر (پیش‌فرض)
    settings: z.boolean().default(true),
    operators: z.boolean().default(false),
    groupsAndAllowances: z.boolean().default(false),
    ratingTables: z.boolean().default(false),
    rawObservations: z.boolean().default(false), // صرفاً با انتخاب صریح کاربر
  }),
})

// ── ایستگاه / فعالیت / عنصر — FR-02 ──
export const stationCreateSchema = z.object({
  name: trimmed(200),
  description: z.string().trim().max(3000).nullable().optional(),
})

export const stationUpdateSchema = stationCreateSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime().optional(),
})

export const activityCreateSchema = z.object({
  name: trimmed(200),
  description: z.string().trim().max(3000).nullable().optional(),
  processType: z.enum(PROCESS_TYPES).default('OPERATION'),
  groupId: z.string().uuid('گروه انتخاب‌شده معتبر نیست').nullable().optional(),
  targetSampleCount: optionalNumber({ min: 1, max: 10000 }),
})

export const activityUpdateSchema = activityCreateSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime().optional(),
})

export const elementCreateSchema = z.object({
  name: trimmed(300),
  description: z.string().trim().max(3000).nullable().optional(),
  elementType: z.enum(ELEMENT_TYPES).default('MANUAL'),
})

export const elementUpdateSchema = elementCreateSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime().optional(),
})

export const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'فهرست ترتیب خالی است'),
})

// ── اپراتور — FR-05 ──
export const operatorCreateSchema = z.object({
  displayName: trimmed(200),
  code: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const operatorUpdateSchema = operatorCreateSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime().optional(),
})

// ── گروه‌ها و مجازها — FR-04 ──
export const groupCreateSchema = z.object({
  name: trimmed(200),
  description: z.string().trim().max(2000).nullable().optional(),
})

export const groupUpdateSchema = groupCreateSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime().optional(),
})

export const categoryCreateSchema = z.object({
  name: trimmed(200),
  code: z.string().trim().max(50).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: numberFromString({ min: 0, max: 9999 }).default(0),
})

export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime().optional(),
})

// درصد مجاز: مقدار اعشاری محاسباتی — ۱۵٪ = 0.15 — FR-15
export const percentValueSchema = numberFromString({ min: 0, max: 0.9999 }).refine(
  (n) => n >= 0 && n < 1,
  { message: 'درصد مجاز باید بین ۰ و کمتر از ۱۰۰ باشد' }
)

export const groupAllowancesPutSchema = z.object({
  values: z.array(
    z.object({
      categoryId: z.string().uuid(),
      percentValue: percentValueSchema.nullable(), // null = بدون مقدار
    })
  ).min(1),
})

export const activityAllowancesPutSchema = z.object({
  overrides: z.array(
    z.object({
      categoryId: z.string().uuid(),
      percentValue: percentValueSchema.nullable(), // null = حذف بازنویسی و بازگشت به ارث‌بری
    })
  ).min(1),
  expectedUpdatedAt: z.string().datetime().optional(),
})

// ── الونس‌ها — مدل جدید سلسله‌مراتبی (جلسه اول) ──

/** تعریف مرکزی الونس — ایجاد */
export const allowanceDefinitionCreateSchema = z.object({
  title: trimmed(200),
  code: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  /** نوع و مقدار پیش‌فرض — صرفاً پیشنهاد اولیه فرم تخصیص (§۲.۲) */
  defaultValueType: z.enum(ALLOWANCE_VALUE_TYPES).nullable().optional(),
  defaultValuePercent: percentValueSchema.nullable().optional(),
  defaultTimeSeconds: optionalNumber({ min: 0, max: MAX_FIXED_TIME_SECONDS }),
  isActive: z.boolean().default(true),
  sortOrder: numberFromString({ min: 0, max: 9999 }).default(0),
}).refine(
  (v) => {
    // اگر نوع پیش‌فرض داده شده، مقدار متناظر باید باشد و بالعکس
    if (v.defaultValueType === 'PERCENT') return v.defaultValuePercent !== null && v.defaultValuePercent !== undefined
    if (v.defaultValueType === 'FIXED_TIME') return v.defaultTimeSeconds !== null && v.defaultTimeSeconds !== undefined
    return v.defaultValuePercent === undefined || v.defaultTimeSeconds === undefined || v.defaultValuePercent === null || v.defaultTimeSeconds === null
  },
  { message: 'برای مقدار پیش‌فرض، نوع و مقدار متناظر باید با هم ثبت شوند' }
).refine(
  (v) => !(v.defaultValueType === 'PERCENT' && (v.defaultTimeSeconds !== null && v.defaultTimeSeconds !== undefined)),
  { message: 'مقدار پیش‌فرض درصدی نباید همراه زمان ثابت باشد' }
).refine(
  (v) => !(v.defaultValueType === 'FIXED_TIME' && v.defaultValuePercent !== null && v.defaultValuePercent !== undefined),
  { message: 'مقدار پیش‌فرض زمان ثابت نباید همراه درصد باشد' }
)

/** تعریف مرکزی الونس — به‌روزرسانی */
export const allowanceDefinitionUpdateSchema = z.object({
  title: trimmed(200).optional(),
  code: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  defaultValueType: z.enum(ALLOWANCE_VALUE_TYPES).nullable().optional(),
  defaultValuePercent: percentValueSchema.nullable().optional(),
  defaultTimeSeconds: optionalNumber({ min: 0, max: MAX_FIXED_TIME_SECONDS }),
  isActive: z.boolean().optional(),
  sortOrder: numberFromString({ min: 0, max: 9999 }).optional(),
  isArchived: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
})

/** یک عملیات تخصیص الونس (§۶ — عملیات کم‌تراکم) */
export const allowanceOpSchema = z.object({
  definitionId: z.string().uuid('تعریف الونس معتبر نیست'),
  action: z.enum(['SET', 'EXCLUDE', 'RESTORE', 'REMOVE'], { message: 'عملیات تخصیص معتبر نیست' }),
  /** فقط برای SET */
  valueType: z.enum(ALLOWANCE_VALUE_TYPES).optional(),
  percentValue: percentValueSchema.nullable().optional(),
  /** ثانیه — واحد دقیقه در UI به ثانیه تبدیل می‌شود (§۲.۳) */
  timeValueSeconds: optionalNumber({ min: 0, max: MAX_FIXED_TIME_SECONDS }),
  applicationBasis: z.enum(ALLOWANCE_BASES).nullable().optional(),
}).refine(
  // valueType فقط برای SET الزامی است — EXCLUDE/RESTORE/REMOVE بدون مقدارند
  (v) => v.action !== 'SET' || v.valueType !== undefined,
  { message: 'برای ثبت مقدار، نوع مقدار الزامی است' }
).refine(
  (v) => !(v.action === 'SET' && v.valueType === 'PERCENT') || (v.percentValue !== null && v.percentValue !== undefined),
  { message: 'مقدار درصدی الزامی است' }
).refine(
  (v) => !(v.action === 'SET' && v.valueType === 'FIXED_TIME') || (v.timeValueSeconds !== null && v.timeValueSeconds !== undefined),
  { message: 'مقدار زمان ثابت الزامی است' }
)

/** دسته عملیات تخصیص روی یک scope */
export const allowanceOpsPutSchema = z.object({
  ops: z.array(allowanceOpSchema).min(1, 'فهرست عملیات خالی است').max(200),
  expectedUpdatedAt: z.string().datetime().optional(),
})

// ── وستینگهاوس — FR-13 ──
export const gradeSchema = z.object({
  factor: z.enum(RATING_FACTORS),
  gradeCode: z.string().trim().min(1).max(10),
  label: z.string().trim().min(1).max(100),
  value: numberFromString({ min: -0.5, max: 0.5 }),
  hint: z.string().trim().max(1000).nullable().optional(),
  sortOrder: numberFromString({ min: 0, max: 999 }).default(0),
})

export const ratingTableCreateSchema = z.object({
  name: trimmed(200),
  source: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  baseOnTableId: z.string().uuid().nullable().optional(), // نسخه جدید بر اساس جدول موجود
  grades: z.array(gradeSchema).min(4, 'جدول حداقل باید برای هر عامل یک درجه داشته باشد'),
  makeDefault: z.boolean().default(true),
})

export const ratingTableUpdateSchema = z.object({
  name: trimmed(200).optional(),
  source: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isDefault: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
})

export const assessmentPutSchema = z.object({
  ratingTableId: z.string().uuid('جدول ارزیابی معتبر نیست'),
  skillGrade: z.string().trim().max(10).nullable(),
  effortGrade: z.string().trim().max(10).nullable(),
  conditionsGrade: z.string().trim().max(10).nullable(),
  consistencyGrade: z.string().trim().max(10).nullable(),
  notes: z.string().trim().max(2000).nullable().optional(),
  copyFromElementId: z.string().uuid().nullable().optional(), // کپی ارزیابی از عنصر مشابه — FR-13
})

// ── تنظیمات ──
export const appSettingsPutSchema = z.object({
  'ui.language': z.enum(['fa', 'en']).optional(),
  'ui.calendar': z.enum(['jalali', 'gregorian']).optional(),
  'ui.digits': z.enum(['persian', 'latin']).optional(),
  'ui.decimals': z.enum(['0', '1', '2', '3', '4']).optional(),
  'backup.autoEnabled': z.enum(['true', 'false']).optional(),
  'backup.intervalMinutes': z.enum(['5', '10', '15', '30', '60', '120', '240']).optional(),
  'backup.retention': z.enum(['3', '5', '10', '20', '50']).optional(),
  'outlier.method': z.enum(['mad', 'iqr']).optional(),
  // آستانهٔ امتیاز Z تعدیل‌شده — مقدار عددی معقول (FR-18: قابل مشاهده/تغییر)
  'outlier.threshold': z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'آستانه باید عدد مثبت باشد')
    .refine((v) => Number(v) >= 0.5 && Number(v) <= 10, 'آستانه باید بین ۰٫۵ و ۱۰ باشد')
    .optional(),
})

export const projectCalcSettingsSchema = z.object({
  allowanceMethod: z.enum(ALLOWANCE_METHODS).optional(),
  aggregationMethod: z.enum(AGGREGATION_METHODS).optional(),
})

// ── جلسه زمان‌سنجی — FR-06 ──
export const sessionCreateSchema = z.object({
  operatorId: z.string().uuid('اپراتور انتخاب‌شده معتبر نیست'),
  timingMethod: z.enum(TIMING_METHODS, { message: 'روش اندازه‌گیری باید برگشت به صفر یا پیوسته باشد' }),
  notes: z.string().trim().max(2000).nullable().optional(),
})

// روش اندازه‌گیری پس از ایجاد قابل تغییر نیست — ۶.۴؛ فیلد روش در به‌روزرسانی پذیرفته نمی‌شود
export const sessionUpdateSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
})

// ── چرخه‌ها — FR-07 ──
/** داده یک مشاهده برای بازیابی/ایجاد چرخه (مسیر Undo حذف چرخه) */
export const observationPayloadSchema = z.object({
  workElementId: z.string().uuid(),
  rawDuration: optionalNumber({ min: 0 }),
  cumulativeReading: optionalNumber({ min: 0 }),
  startOffset: optionalNumber({ min: 0 }),
  endOffset: optionalNumber({ min: 0 }),
  validityStatus: z.enum(VALIDITY_STATUSES).optional(),
  exclusionReason: z.string().trim().max(500).nullable().optional(),
})

export const cyclesAddSchema = z.object({
  count: numberFromString({ min: 1, max: 200 }).default(1),
  /** بارگذاری داده کامل چرخه‌ها (برای بازگردانی Undo) — ترتیب = ترتیب ایجاد */
  withData: z
    .array(
      z.object({
        cycleNo: numberFromString({ min: 1, max: 100000 }),
        notes: z.string().trim().max(2000).nullable().optional(),
        isComplete: z.boolean().optional(),
        observations: z.array(observationPayloadSchema).default([]),
      })
    )
    .max(200)
    .optional(),
})

export const cycleUpdateSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
})

// ── سلول‌های برگه — FR-07/08/09/10 ──
/** به‌روزرسانی دسته‌ای سلول‌های یک چرخه
 *  غیبت فیلد = بدون تغییر / null = پاک‌کردن مقدار / عدد = ثبت مقدار */
export const cellPutSchema = z.object({
  workElementId: z.string().uuid('عنصر کاری معتبر نیست'),
  rawDuration: optionalNumber({ min: 0 }),
  cumulativeReading: optionalNumber({ min: 0 }),
  startOffset: optionalNumber({ min: 0 }),
  endOffset: optionalNumber({ min: 0 }),
})

export const cellsPutSchema = z.object({
  cells: z.array(cellPutSchema).min(1, 'فهرست سلول‌ها خالی است').max(500),
  expectedUpdatedAt: z.string().datetime().optional(),
})

// ── Paste چندسلولی — FR-07 ──
export const pasteModeSchema = z.enum(['ALL_OR_NOTHING', 'SKIP_INVALID'])

export const pasteSchema = z.object({
  /** شماره چرخهٔ سلول مبدأ (۱-مبنا) */
  startCycleNo: numberFromString({ min: 1, max: 100000 }),
  /** اندیس ستون عنصر سلول مبدأ (۰-مبنا؛ ترتیب عناصر فعالیت) */
  startColIndex: numberFromString({ min: 0, max: 499 }),
  /** داده خام Paste — سطر×ستون — اعداد فارسی/لاتین پذیرفته می‌شود */
  data: z.array(z.array(z.string().max(100)).max(500)).min(1).max(200),
  mode: pasteModeSchema.default('ALL_OR_NOTHING'),
})

// ── وضعیت مشاهده — FR-11 ──
export const validityPutSchema = z.object({
  validityStatus: z.enum(['VALID', 'EXCLUDED']),
  exclusionReason: z.string().trim().max(500).nullable().optional(),
})

// ── نهایی‌سازی — FR-12 ──
export const finalizeSchema = z.object({
  reason: z.string().trim().max(2000).nullable().optional(), // دلیل نهایی‌سازی با کمبود نمونه
})

// ── بازیابی پشتیبان — FR-24 ──
export const restoreSchema = z.object({
  confirmReplace: z.literal(true, { message: 'برای بازیابی، تأیید صریح جایگزینی داده‌ها الزامی است' }),
})

// ── نمودار فرایند OPC/FPC — FR-20 ──
export const CHART_TYPES = ['OPC', 'FPC'] as const
export type ChartTypeValue = (typeof CHART_TYPES)[number]

/** انواع گره مجاز در هر نوع نمودار — FR-20.3/4 + جلسه ۲ §۱۵.۱
 *  OPC کلاسیک: فقط OPERATION/INSPECTION.
 *  OPC توسعه‌یافته: + MATERIAL_INPUT (ورودی مواد/قطعه/نیم‌ساخته — node مستقل) و STORAGE (انبار، مثلث وارونه).
 *  FPC: هر پنج نوع استاندارد + MATERIAL_INPUT به‌عنوان node مجزا (نه event). */
export const OPC_NODE_TYPES = ['OPERATION', 'INSPECTION'] as const
export const OPC_EXTENSION_NODE_TYPES = ['OPERATION', 'INSPECTION', 'MATERIAL_INPUT', 'STORAGE'] as const
export const FPC_NODE_TYPES = ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE', 'MATERIAL_INPUT'] as const
/** انواع مجاز برای گره دستی — سرویس بر اساس chartType محدود می‌کند */
export const CHART_MANUAL_NODE_TYPES = FPC_NODE_TYPES

export const chartManualNodeCreateSchema = z.object({
  label: trimmed(200),
  nodeType: z.enum(CHART_MANUAL_NODE_TYPES, { message: 'نوع گره معتبر نیست' }),
})

export const chartNodeUpdateSchema = z
  .object({
    label: trimmed(200).optional(),
    nodeType: z.enum(CHART_MANUAL_NODE_TYPES, { message: 'نوع گره معتبر نیست' }).optional(),
    positionX: numberFromString({ min: -100000, max: 100000 }).optional(),
    positionY: numberFromString({ min: -100000, max: 100000 }).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'حداقل یک فیلد برای به‌روزرسانی لازم است' })

export const chartEdgeCreateSchema = z.object({
  sourceNodeId: z.string().uuid('گره مبدأ معتبر نیست'),
  targetNodeId: z.string().uuid('گره مقصد معتبر نیست'),
  // جلسه ۲ §۱۵.۴ — anchorهای اتصال (اختیاری؛ تهی = خودکار)
  sourceAnchor: z.enum(['top', 'bottom', 'left', 'right']).optional(),
  targetAnchor: z.enum(['top', 'bottom', 'left', 'right']).optional(),
})

export const chartOrderMoveSchema = z.object({
  nodeId: z.string().uuid('گره معتبر نیست'),
  direction: z.enum(['up', 'down'], { message: 'جهت جابه‌جایی معتبر نیست' }),
})

// ── خروجی نوع‌ها ──
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>
export type StationCreateInput = z.infer<typeof stationCreateSchema>
export type StationUpdateInput = z.infer<typeof stationUpdateSchema>
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>
export type ElementCreateInput = z.infer<typeof elementCreateSchema>
export type ElementUpdateInput = z.infer<typeof elementUpdateSchema>
export type OperatorCreateInput = z.infer<typeof operatorCreateSchema>
export type OperatorUpdateInput = z.infer<typeof operatorUpdateSchema>
export type GroupCreateInput = z.infer<typeof groupCreateSchema>
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>
export type AllowanceDefinitionCreateInput = z.infer<typeof allowanceDefinitionCreateSchema>
export type AllowanceDefinitionUpdateInput = z.infer<typeof allowanceDefinitionUpdateSchema>
export type AllowanceOpsPutInput = z.infer<typeof allowanceOpsPutSchema>
export type AllowanceOpInput = z.infer<typeof allowanceOpSchema>
export type RatingTableCreateInput = z.infer<typeof ratingTableCreateSchema>
export type AssessmentPutInput = z.infer<typeof assessmentPutSchema>
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>
export type CyclesAddInput = z.infer<typeof cyclesAddSchema>
export type CycleUpdateInput = z.infer<typeof cycleUpdateSchema>
export type CellsPutInput = z.infer<typeof cellsPutSchema>
export type CellPutInput = z.infer<typeof cellPutSchema>
export type PasteInput = z.infer<typeof pasteSchema>
export type ValidityPutInput = z.infer<typeof validityPutSchema>
export type ChartManualNodeCreateInput = z.infer<typeof chartManualNodeCreateSchema>
export type ChartNodeUpdateInput = z.infer<typeof chartNodeUpdateSchema>
export type ChartEdgeCreateInput = z.infer<typeof chartEdgeCreateSchema>
export type ChartOrderMoveInput = z.infer<typeof chartOrderMoveSchema>

// ── چیدمان شخصی‌سازی‌شدهٔ داشبورد — FR-21 (فاز ۶) ──
// ترتیب و مرئی‌بودن کارت‌ها و نمودارها؛ ذخیره در تنظیمات پروژه.
// توجه: کلیدهای مجاز محدود به شناسه‌های شناخته‌شدهٔ سرویس داشبورد است.
export const DASHBOARD_CARD_KEYS = ['st', 'meanCycle', 'samples', 'target'] as const
export const DASHBOARD_WIDGET_KEYS = ['activities', 'statusDonut', 'operators', 'elementCv', 'reviewNeeds'] as const

export const dashboardLayoutSchema = z.object({
  cardOrder: z.array(z.enum(DASHBOARD_CARD_KEYS)).max(8).optional(),
  hiddenCards: z.array(z.enum(DASHBOARD_CARD_KEYS)).max(8).optional(),
  widgetOrder: z.array(z.enum(DASHBOARD_WIDGET_KEYS)).max(8).optional(),
  hiddenWidgets: z.array(z.enum(DASHBOARD_WIDGET_KEYS)).max(8).optional(),
})
