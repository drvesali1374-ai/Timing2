// ═══════════════════════════════════════════════════════════
// سرویس تنظیمات محاسباتی مجازها — FR-04 / FR-15
// v1.5.2 بازبینی نهایی §۱۲/§۱۳ — گروه‌های فعالیت، دسته‌های قدیمی و
// زبانهٔ «الونس‌های خط تولید» حذف شدند؛ تعریف مرکزی و تخصیص
// سلسله‌مراتتی در effective-allowance-service مدیریت می‌شوند.
// این فایل فقط تنظیمات روش اعمال/تجمیع را نگه می‌دارد.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError, PROJECT_SETTING_KEYS, DEFAULT_PROJECT_SETTINGS } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { getProjectSettings, putProjectSettings } from './settings-service'
import { resolveForActivity } from './effective-allowance-service'

async function assertProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
  if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
  return p
}

/** تنظیمات محاسباتی پروژه — FR-15 / ۱۰.۱ */
export async function getCalcSettings(projectId: string) {
  await assertProject(projectId)
  const settings = await getProjectSettings(projectId)
  return {
    allowanceMethod: settings[PROJECT_SETTING_KEYS.allowanceMethod] ?? DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.allowanceMethod],
    aggregationMethod: settings[PROJECT_SETTING_KEYS.aggregationMethod] ?? DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.aggregationMethod],
  }
}

export async function putCalcSettings(
  projectId: string,
  input: { allowanceMethod?: string; aggregationMethod?: string }
) {
  await assertProject(projectId)
  const values: Record<string, string> = {}
  if (input.allowanceMethod) values[PROJECT_SETTING_KEYS.allowanceMethod] = input.allowanceMethod
  if (input.aggregationMethod) values[PROJECT_SETTING_KEYS.aggregationMethod] = input.aggregationMethod
  await putProjectSettings(projectId, values)

  // تغییر روش محاسبه → نتایج قبلی نیازمند محاسبه مجدد (Snapshot حفظ می‌شود) — FR-27
  await db.calculationRun.updateMany({ where: { projectId }, data: { status: 'STALE' } })

  // اگر روش ۲ انتخاب شده، تمام عناصر را از نظر P < ۱۰۰٪ بازبینی کن — FR-15 + جلسه اول §۳
  if (input.allowanceMethod === 'SHARE_OF_ST') {
    const activities = await db.activity.findMany({ where: { station: { projectId } }, select: { id: true, name: true } })
    const violations: { activityId: string; activityName: string; totalA: number }[] = []
    for (const a of activities) {
      const resolution = await resolveForActivity(a.id)
      for (const [, elRes] of resolution.elements) {
        if (elRes.summary.totalPercent >= 1) {
          violations.push({ activityId: a.id, activityName: a.name, totalA: elRes.summary.totalPercent })
          break // یک عنصر متخلف برای هر فعالیت کافی است
        }
      }
    }
    if (violations.length > 0) {
      await putProjectSettings(projectId, { [PROJECT_SETTING_KEYS.allowanceMethod]: 'PERCENT_OF_NT' })
      throw new AppError(
        'ALLOWANCE_TOO_HIGH',
        `در روش «سهم از زمان استاندارد» مجموع مجازها باید کمتر از ۱۰۰٪ باشد. ${violations.length} فعالیت دارای مجموع غیرمجاز است و تغییر روش اعمال نشد: ${violations.map((v) => v.activityName).join('، ')}`,
        422,
        { violations }
      )
    }
  }

  await recordAudit({
    entityType: 'Project', entityId: projectId, action: 'UPDATE', entityName: 'تنظیمات محاسبات',
    after: input, projectId,
  })
  return getCalcSettings(projectId)
}
