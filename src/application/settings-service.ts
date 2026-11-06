// ═══════════════════════════════════════════════════════════
// سرویس تنظیمات سراسری — FR-29 / FR-24
// مقادیر پیش‌فرض به‌صورت تنبل ایجاد می‌شوند؛ داده جعلی وجود ندارد.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { APP_SETTING_DEFAULTS } from '@/domain/types'

export async function getAppSettings(): Promise<Record<string, string>> {
  const rows = await db.appSetting.findMany()
  const map: Record<string, string> = { ...APP_SETTING_DEFAULTS }
  for (const row of rows) map[row.id] = row.value
  return map
}

export async function putAppSettings(values: Record<string, string>): Promise<Record<string, string>> {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in APP_SETTING_DEFAULTS)) continue // فقط کلیدهای شناخته‌شده
    await db.appSetting.upsert({ where: { id: key }, create: { id: key, value }, update: { value } })
  }
  return getAppSettings()
}

/** تنظیمات پروژه (با پیش‌فرض) — FR-15 / ۱۰.۱ */
export async function getProjectSettings(projectId: string): Promise<Record<string, string>> {
  const rows = await db.projectSetting.findMany({ where: { projectId } })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return map
}

export async function putProjectSettings(projectId: string, values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    const existing = await db.projectSetting.findUnique({
      where: { projectId_key: { projectId, key } },
    })
    if (existing) {
      await db.projectSetting.update({
        where: { projectId_key: { projectId, key } },
        data: { value, version: { increment: 1 } },
      })
    } else {
      await db.projectSetting.create({ data: { projectId, key, value } })
    }
  }
}
