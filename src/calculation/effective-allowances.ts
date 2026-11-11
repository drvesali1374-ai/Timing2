// ═══════════════════════════════════════════════════════════
// الونس‌های مؤثر سلسله‌مراتبی — جلسه اول بازطراحی
// زنجیره: Project/Line → Station → Activity → WorkElement
//
// قواعد (§۲.۴ سند):
//  ۱. تخصیص سطح بالاتر به زیرمجموعه‌ها ارث می‌رسد.
//  ۲. مقدار فعال همان تعریف در نزدیک‌ترین سطح جایگزین والد می‌شود.
//  ۳. جایگزینی فقط همان تعریف را تغییر می‌دهد؛ سایر الونس‌ها حفظ می‌شوند.
//  ۴. ارث‌بری افقی بین siblingها ممنوع.
//  ۵. EXCLUDE در یک سطح، همان الونس را در آن شاخه و تمام زیرمجموعه‌ها
//     غیرفعال می‌کند.
//  ۶. تعریف مجدد صریح همان ID در سطح پایین‌تر، آن را دوباره فعال می‌کند.
//  ۷. هر تعریف حداکثر یک بار مؤثر است؛ نزدیک‌ترین تخصیص ملاک است.
//  ۸. ارث‌رسیده‌ها به‌صورت کپی ذخیره نمی‌شوند — resolve در زمان درخواست.
//
// محاسبه (§۳):
//  P = Σ درصد الونس‌های مؤثر (نزدیک‌ترین تخصیص هر تعریف)
//  T = Σ ثانیه‌های ثابت PER_ELEMENT_EXECUTION در سطح عنصر
//  ST = computeStandardTime(NT, P, method) + T
//  PER_CYCLE دقیقاً یک‌بار در سطح چرخه — نه در ST تک‌تک عناصر.
//  زمان ثابت PER_ELEMENT_EXECUTION در سطح بالاتر از عنصر →
//  «نیازمند قاعده تجمیع» (نه حذف بی‌صدا، نه چندباره‌اعمال).
// ═══════════════════════════════════════════════════════════
import {
  type AllowanceScopeType,
  type AllowanceStatus,
  type AllowanceMode,
  type AllowanceValueType,
  type AllowanceBasis,
  type AllowanceMethod,
} from '@/domain/types'
import { computeStandardTime, validateAllowanceTotal } from './allowances'
import { round12 } from './westinghouse'

// ── ورودی‌های خالص (بدون وابستگی به Prisma — آینه آفلاین: formulas.js) ──

export interface AllowanceDefinitionLike {
  id: string
  title: string
  code?: string | null
  description?: string | null
  isActive: boolean
  sortOrder: number
  defaultValueType?: string | null
  defaultValuePercent?: number | null
  defaultTimeSeconds?: number | null
}

export interface AllowanceAssignmentLike {
  definitionId: string
  scopeType: AllowanceScopeType
  scopeId: string
  mode: AllowanceMode
  valueType: AllowanceValueType
  percentValue: number | null
  timeValueSeconds: number | null
  applicationBasis: AllowanceBasis | null
}

/** یک حلقه از زنجیره والد — از ریشه به برگ مرتب می‌شود */
export interface ScopeChainLink {
  type: AllowanceScopeType
  id: string
  /** برچسب نمایشی مبدأ (نام پروژه/ایستگاه/فعالیت/عنصر) */
  label: string
}

export type ScopeChain = ScopeChainLink[]

// ── خروجی ──

export interface ResolvedAllowanceRow {
  definitionId: string
  title: string
  code: string | null
  /** وضعیت ارث‌بری نسبت به scope هدف */
  status: AllowanceStatus
  /**
   * نوع مقدار مؤثر — برای ردیف EXCLUDED «نوع نمایشی» است که از نزدیک‌ترین
   * تصمیم فعال بالادست و سپس پیش‌فرض تعریف مشتق می‌شود (نه نوع ساختگی)؛
   * اگر هیچ منبع معتبری نبود null است و ردیف به‌صورت خنثی نمایش داده می‌شود.
   */
  valueType: AllowanceValueType | null
  /** مقدار درصدی مؤثر (اعشاری محاسباتی) — فقط PERCENT */
  percentValue: number | null
  /** ثانیه‌های ثابت مؤثر — فقط FIXED_TIME */
  timeValueSeconds: number | null
  /** مبنای وقوع زمان ثابت */
  applicationBasis: AllowanceBasis | null
  /** مبدأ مقدار مؤثر */
  sourceScopeType: AllowanceScopeType | null
  sourceScopeLabel: string | null
  /** آیا تخصیص محلی (در همین scope) وجود دارد؟ */
  hasLocalDecision: boolean
  /** مقدار والد مستقیم (نزدیک‌ترین تصمیم در سطوح بالاترِ خود scope) */
  parentValue: number | null
  /** نوع مقدار والد مستقیم — فقط وقتی والد فعال باشد */
  parentValueType: AllowanceValueType | null
  /** مبنای وقوع زمان ثابت والد مستقیم */
  parentApplicationBasis: AllowanceBasis | null
  parentScopeType: AllowanceScopeType | null
  /** آیا برای این تعریف تصمیمی در سطوح بالاترِ خود scope وجود دارد؟ */
  parentDecisionExists: boolean
  /** حالت تصمیم والد مستقیم: ACTIVE | EXCLUDE | null */
  parentMode: AllowanceMode | null
  /** زمان ثابت per-execution در سطح بالاتر از عنصر → نیاز به قاعده تجمیع */
  needsAggregationRule: boolean
  /** توضیح فارسی کوتاه وضعیت */
  note: string | null
}

export interface EffectiveAllowanceSummary {
  /** تعداد الونس‌های مؤثر (فعال) */
  count: number
  /** جمع درصدهای مؤثر — P */
  totalPercent: number
  /** جمع ثانیه‌های ثابت per-execution (فقط سطح عنصر) */
  perExecutionSeconds: number
  /** جمع ثانیه‌های ثابت per-cycle — جداگانه، یک‌بار در چرخه */
  perCycleSeconds: number
  /** تعداد ردیف‌های نیازمند قاعده تجمیع */
  needsAggregationCount: number
}

export interface ResolvedAllowances {
  scopeType: AllowanceScopeType
  scopeId: string
  rows: ResolvedAllowanceRow[]
  summary: EffectiveAllowanceSummary
}

// ── اعتبارسنجی مقدار تخصیص (§۲.۳) ──

export class AllowanceValueError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * اعتبارسنجی سازگاری نوع و مقدار تخصیص.
 * PERCENT فقط percentValue و FIXED_TIME فقط timeValueSeconds دارد؛
 * مقدار منفی/NaN/Infinity رد می‌شود.
 */
export function validateAssignmentValue(input: {
  mode: AllowanceMode
  valueType: AllowanceValueType
  percentValue: number | null
  timeValueSeconds: number | null
  applicationBasis: AllowanceBasis | null
}): void {
  if (input.mode === 'EXCLUDE') return // حذف از ارث‌بری مقدار ندارد
  if (input.valueType === 'PERCENT') {
    if (input.percentValue === null || input.percentValue === undefined) {
      throw new AllowanceValueError('VALUE_REQUIRED', 'مقدار درصدی الزامی است.')
    }
    if (!Number.isFinite(input.percentValue)) {
      throw new AllowanceValueError('VALUE_INVALID', 'مقدار درصدی معتبر نیست (NaN/Infinity).')
    }
    if (input.percentValue < 0) {
      throw new AllowanceValueError('VALUE_NEGATIVE', 'مقدار درصدی نمی‌تواند منفی باشد.')
    }
    if (input.percentValue >= 1) {
      throw new AllowanceValueError('VALUE_TOO_HIGH', 'درصد الونس باید کمتر از ۱۰۰ باشد.')
    }
    if (input.timeValueSeconds !== null && input.timeValueSeconds !== undefined) {
      throw new AllowanceValueError('VALUE_TYPE_MISMATCH', 'الونس درصدی نباید مقدار زمان ثابت داشته باشد.')
    }
  } else if (input.valueType === 'FIXED_TIME') {
    if (input.timeValueSeconds === null || input.timeValueSeconds === undefined) {
      throw new AllowanceValueError('VALUE_REQUIRED', 'مقدار زمان ثابت الزامی است.')
    }
    if (!Number.isFinite(input.timeValueSeconds)) {
      throw new AllowanceValueError('VALUE_INVALID', 'مقدار زمان ثابت معتبر نیست (NaN/Infinity).')
    }
    if (input.timeValueSeconds < 0) {
      throw new AllowanceValueError('VALUE_NEGATIVE', 'مقدار زمان ثابت نمی‌تواند منفی باشد.')
    }
    if (input.percentValue !== null && input.percentValue !== undefined) {
      throw new AllowanceValueError('VALUE_TYPE_MISMATCH', 'الونس زمان ثابت نباید مقدار درصدی داشته باشد.')
    }
    if (input.applicationBasis !== 'PER_ELEMENT_EXECUTION' && input.applicationBasis !== 'PER_CYCLE') {
      throw new AllowanceValueError('BASIS_REQUIRED', 'مبنای وقوع زمان ثابت الزامی است (هر اجرا / هر چرخه).')
    }
  } else {
    throw new AllowanceValueError('VALUE_TYPE_INVALID', 'نوع مقدار الونس معتبر نیست.')
  }
}

// ── resolve ──

/**
 * مقدار عددی یک تخصیص فعال — برحسب نوع.
 * (برای مقایسه و نمایش «مقدار والد»)
 */
function assignmentValue(a: AllowanceAssignmentLike): number | null {
  if (a.mode !== 'ACTIVE') return null
  return a.valueType === 'PERCENT' ? a.percentValue : a.timeValueSeconds
}

/**
 * نوع نمایشی یک تخصیص EXCLUDE — مستقل از نوع مقدار فعال (الزام ۴):
 *  ۱. نزدیک‌ترین تصمیم «فعال» در سطوح بالاترِ خود scope (نوع اصلی الونس در شاخه)،
 *  ۲. وگرنه نوع/مقدار پیش‌فرض تعریف مرکزی،
 *  ۳. وگرنه null — وضعیت حذف‌شده به‌صورت خنثی نمایش داده می‌شود.
 * EXCLUDE یعنی حذف از ارث‌بری؛ نباید الونس زمان ثابت را درصدی جلوه دهد.
 */
function deriveExcludedDisplayType(
  nearestActiveAbove: AllowanceAssignmentLike | null,
  def: AllowanceDefinitionLike
): AllowanceValueType | null {
  if (nearestActiveAbove && nearestActiveAbove.mode === 'ACTIVE') return nearestActiveAbove.valueType
  if (def.defaultValueType === 'PERCENT' || def.defaultValueType === 'FIXED_TIME') return def.defaultValueType
  if (def.defaultTimeSeconds !== null && def.defaultTimeSeconds !== undefined) return 'FIXED_TIME'
  if (def.defaultValuePercent !== null && def.defaultValuePercent !== undefined) return 'PERCENT'
  return null
}

/**
 * الونس‌های مؤثر یک scope را با پیمایش زنجیره والد resolve می‌کند.
 *
 * @param definitions تعریف‌های مرکزی پروژه (فعال و غیرفعال — ردیف غیرفعال
 *        در خروجی نمی‌آید چون تعریف غیرفعال تخصیص مؤثر ندارد؛ §۲.۲)
 * @param assignments همهٔ تخصیص‌های همان پروژه (یا دست‌کم زنجیره والد)
 * @param chain زنجیره از ریشه به برگ؛ آخرین حلقه = scope هدف
 */
export function resolveEffectiveAllowances(params: {
  definitions: AllowanceDefinitionLike[]
  assignments: AllowanceAssignmentLike[]
  chain: ScopeChain
}): ResolvedAllowances {
  const { definitions, assignments, chain } = params
  const target = chain[chain.length - 1]
  if (!target) throw new Error('زنجیره scope خالی است.')

  // نزدیک‌ترین سطح اول پیمایش می‌شود: از برگ به ریشه
  const rows: ResolvedAllowanceRow[] = []
  let count = 0
  let totalPercent = 0
  let perExecutionSeconds = 0
  let perCycleSeconds = 0
  let needsAggregationCount = 0

  const sortedDefs = [...definitions].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'fa'))

  for (const def of sortedDefs) {
    // تعریف غیرفعال/بایگانی‌شده هیچ تخصیص مؤثری ندارد
    if (!def.isActive) continue

    // پیمایش از برگ به ریشه — نزدیک‌ترین تصمیم ملاک است (قاعده ۹)
    let decision: AllowanceAssignmentLike | null = null
    let parentDecision: AllowanceAssignmentLike | null = null
    for (let i = chain.length - 1; i >= 0; i--) {
      const link = chain[i]
      const found = assignments.find(
        (a) =>
          a.definitionId === def.id &&
          a.scopeType === link.type &&
          a.scopeId === link.id &&
          (a.mode === 'ACTIVE' || a.mode === 'EXCLUDE')
      )
      if (!found) continue
      if (!decision) decision = found
      else if (!parentDecision) parentDecision = found
      if (decision && parentDecision) break
    }

    if (!decision) continue // هیچ تصمیمی در این شاخه نیست → ردیفی وجود ندارد

    const isLocal = decision.scopeType === target.type && decision.scopeId === target.id
    const sourceLink = chain.find((l) => l.type === decision!.scopeType && l.id === decision!.scopeId)

    // نزدیک‌ترین تصمیم «فعال» در سطوح بالاترِ خود scope — برای نوع نمایشی EXCLUDED (الزام ۴)
    let nearestActiveAbove: AllowanceAssignmentLike | null = null
    for (let i = chain.length - 1; i >= 0; i--) {
      const link = chain[i]
      if (link.type === target.type && link.id === target.id) continue // خود scope
      const found = assignments.find(
        (a) =>
          a.definitionId === def.id &&
          a.scopeType === link.type &&
          a.scopeId === link.id &&
          a.mode === 'ACTIVE'
      )
      if (found) {
        nearestActiveAbove = found
        break
      }
    }

    // والد مستقیم scope (نه والد تصمیم):
    //  • تصمیم محلی وجود دارد → والد = نزدیک‌ترین تصمیم بالاتر (parentDecision)
    //  • تصمیم ارثی است → خود تصمیم از والد می‌آید؛ والد مستقیم همان است.
    const directParent: AllowanceAssignmentLike | null = isLocal ? parentDecision : decision
    const parentIsActive = directParent !== null && directParent.mode === 'ACTIVE'

    let status: AllowanceStatus
    if (decision.mode === 'EXCLUDE') {
      status = 'EXCLUDED'
    } else if (isLocal && parentDecision) {
      status = 'OVERRIDDEN'
    } else if (isLocal) {
      status = 'CUSTOM'
    } else {
      status = 'INHERITED'
    }

    const excluded = decision.mode === 'EXCLUDE'
    // نوع نمایشی ردیف — برای EXCLUDED از منابع معنادار مشتق می‌شود (الزام ۴)
    const rowValueType: AllowanceValueType | null = excluded
      ? deriveExcludedDisplayType(nearestActiveAbove, def)
      : decision.valueType
    // زمان ثابت per-execution در سطح بالاتر از عنصر → نیازمند قاعده تجمیع (§۲.۳)
    const needsAggregationRule =
      !excluded &&
      decision.valueType === 'FIXED_TIME' &&
      decision.applicationBasis === 'PER_ELEMENT_EXECUTION' &&
      decision.scopeType !== 'WORK_ELEMENT'

    let note: string | null = null
    if (excluded) {
      note = isLocal
        ? 'این الونس در همین سطح از ارث‌بری حذف شده و روی این شاخه و زیرمجموعه‌هایش اعمال نمی‌شود.'
        : `حذف از ارث‌بری در سطح «${sourceLink?.label ?? decision.scopeType}» اعلام شده و در این شاخه غیرفعال است.`
    } else if (needsAggregationRule) {
      note = 'زمان ثابت «به‌ازای هر اجرا» در سطح بالاتر از عنصر تعریف شده است؛ قاعده تجمیع مهندسی تعیین نشده و مقدار بی‌صدا حذف یا چندبار اعمال نمی‌شود — در ST عنصر لحاظ نشد.'
    } else if (isLocal && parentDecision && parentDecision.mode === 'EXCLUDE') {
      note = 'این شاخه پس از حذف از ارث‌بری در سطح بالاتر، با تعریف مجدد صریح دوباره فعال شده است.'
    } else if (status === 'OVERRIDDEN') {
      const pLink = chain.find((l) => l.type === parentDecision!.scopeType && l.id === parentDecision!.scopeId)
      note = `مقدار سطح «${pLink?.label ?? parentDecision!.scopeType}» در همین سطح جایگزین شده است.`
    }

    const row: ResolvedAllowanceRow = {
      definitionId: def.id,
      title: def.title,
      code: def.code ?? null,
      status,
      valueType: rowValueType,
      percentValue: !excluded && decision.valueType === 'PERCENT' ? decision.percentValue : null,
      timeValueSeconds: !excluded && decision.valueType === 'FIXED_TIME' ? decision.timeValueSeconds : null,
      applicationBasis: decision.valueType === 'FIXED_TIME' ? decision.applicationBasis : null,
      sourceScopeType: decision.scopeType,
      sourceScopeLabel: sourceLink?.label ?? null,
      hasLocalDecision: isLocal,
      parentValue: parentIsActive ? assignmentValue(directParent!) : null,
      parentValueType: parentIsActive ? directParent!.valueType : null,
      parentApplicationBasis:
        parentIsActive && directParent!.valueType === 'FIXED_TIME' ? directParent!.applicationBasis : null,
      parentScopeType: directParent?.scopeType ?? null,
      parentDecisionExists: directParent !== null,
      parentMode: directParent?.mode ?? null,
      needsAggregationRule,
      note,
    }
    rows.push(row)

    if (!excluded && !needsAggregationRule) {
      count++
      if (decision.valueType === 'PERCENT' && row.percentValue !== null) {
        totalPercent += row.percentValue
      } else if (decision.valueType === 'FIXED_TIME' && row.timeValueSeconds !== null) {
        if (row.applicationBasis === 'PER_CYCLE') perCycleSeconds += row.timeValueSeconds
        else perExecutionSeconds += row.timeValueSeconds
      }
    } else if (needsAggregationRule) {
      needsAggregationCount++
    }
  }

  return {
    scopeType: target.type,
    scopeId: target.id,
    rows,
    summary: {
      count,
      totalPercent: round12(totalPercent),
      perExecutionSeconds: round12(perExecutionSeconds),
      perCycleSeconds: round12(perCycleSeconds),
      needsAggregationCount,
    },
  }
}

// ── محاسبه ST با الونس‌های جدید (§۳) ──

export interface ElementAllowanceFactors {
  /** جمع درصدهای مؤثر عنصر */
  totalPercent: number
  /** ثانیه‌های ثابت per-execution در سطح همین عنصر */
  perExecutionSeconds: number
  /** ثانیه‌های ثابت per-cycle — جدا از ST عنصر (§۳.۲) */
  perCycleSeconds: number
}

export interface ElementSTResult {
  st: number
  /** توضیح فرمول اعمال‌شده — خروجی قابل توضیح (§۳.۳) */
  explanation: string
}

/**
 * ST عنصر با ترتیب قطعی سند:
 *  ۱. ابتدا درصدها مطابق روش پروژه روی NT اعمال می‌شوند.
 *  ۲. سپس مجموع ثانیه‌های ثابت per-execution اضافه می‌شود.
 */
export function computeElementStandardTime(
  normalTime: number,
  factors: ElementAllowanceFactors,
  method: AllowanceMethod
): ElementSTResult {
  const percentPart = computeStandardTime(normalTime, factors.totalPercent, method)
  const st = round12(percentPart + factors.perExecutionSeconds)
  const stFormula = method === 'PERCENT_OF_NT' ? 'NT × (1 + A)' : 'NT / (1 − A)'
  const explanation =
    factors.perExecutionSeconds > 0
      ? `ST = (${stFormula} با A=${factors.totalPercent}) + ${factors.perExecutionSeconds}s زمان ثابت هر اجرا`
      : `ST = ${stFormula} با A=${factors.totalPercent}`
  return { st, explanation }
}

/**
 * اعتبارسنجی مجموع درصدهای مؤثر با روش پروژه — پل به اعتبارسنجی فعلی.
 * در روش سهم از ST، مجموع ۱۰۰٪ یا بیشتر رد می‌شود (تست §۱۰.۲).
 */
export function validateEffectivePercent(totalPercent: number, method: AllowanceMethod): void {
  // از موتور موجود استفاده می‌کنیم — محاسبه موازی ممنوع (§۳.۳)
  validateAllowanceTotal(totalPercent, method)
}
