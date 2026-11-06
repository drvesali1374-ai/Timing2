// تنظیمات سراسری — FR-29
// تغییر روش/آستانهٔ تشخیص غیرعادی → بازمحاسبهٔ پرچم‌های همهٔ پروژه‌ها — FR-18
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getAppSettings, putAppSettings } from '@/application/settings-service'
import { refreshOutliersForProject } from '@/application/outlier-service'
import { markProjectCalculationsStale } from '@/application/calc-stale'
import { appSettingsPutSchema } from '@/domain/validation'
import { db } from '@/lib/db'

export function GET(req: NextRequest) {
  return handle(req, async () => {
    return ok({ settings: await getAppSettings() })
  })
}

export function PUT(req: NextRequest) {
  return handle(req, async () => {
    const before = await getAppSettings()
    const body = appSettingsPutSchema.parse(await readJson(req))
    const settings = await putAppSettings(body)

    const outlierChanged =
      (body['outlier.method'] !== undefined && body['outlier.method'] !== before['outlier.method']) ||
      (body['outlier.threshold'] !== undefined && body['outlier.threshold'] !== before['outlier.threshold'])

    if (outlierChanged) {
      // بازمحاسبهٔ کنترل‌شدهٔ پرچم‌ها در همهٔ پروژه‌ها (تک‌کاربر و محلی؛ حجم دادهٔ محدود)
      const projects = await db.project.findMany({ select: { id: true } })
      for (const p of projects) {
        await refreshOutliersForProject(p.id)
        await markProjectCalculationsStale(p.id)
      }
    }

    return ok({ settings })
  })
}
