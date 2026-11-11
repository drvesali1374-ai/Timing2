// تنظیمات مرکز گزارش‌ها و خروجی‌ها — جلسه ۲ §۱۶
// حالت نمایش وستینگهاوس (GRADE | NUMERIC | BOTH) + تنظیمات چاپ — در سطح پروژه
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/domain/types'

type Ctx = { params: Promise<{ id: string }> }

const reportSettingsSchema = z.object({
  westinghouseMode: z.enum(['GRADE', 'NUMERIC', 'BOTH']).optional(),
  /** اندازهٔ کاغذ چاپ گزارش */
  paperSize: z.enum(['A4', 'A3']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
})

export type ReportSettingsDto = {
  westinghouseMode: 'GRADE' | 'NUMERIC' | 'BOTH'
  paperSize: 'A4' | 'A3'
  orientation: 'portrait' | 'landscape'
}

/** پیش‌فرض = BOTH تا گزارش تاریخی با تنظیم جدید بی‌صدا تغییر نکند (رفتار جاری: grade+value) */
const DEFAULTS: ReportSettingsDto = { westinghouseMode: 'BOTH', paperSize: 'A4', orientation: 'portrait' }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const rows = await db.projectSetting.findMany({
      where: { projectId: id, key: { startsWith: 'report.' } },
    })
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return ok<ReportSettingsDto>({
      westinghouseMode: (map['report.westinghouseMode'] as ReportSettingsDto['westinghouseMode']) ?? DEFAULTS.westinghouseMode,
      paperSize: (map['report.paperSize'] as ReportSettingsDto['paperSize']) ?? DEFAULTS.paperSize,
      orientation: (map['report.orientation'] as ReportSettingsDto['orientation']) ?? DEFAULTS.orientation,
    })
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const project = await db.project.findUnique({ where: { id }, select: { id: true } })
    if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
    const body = reportSettingsSchema.parse(await readJson(req))
    const entries = Object.entries(body).filter(([, v]) => v !== undefined) as Array<[string, string]>
    for (const [key, value] of entries) {
      const settingKey = `report.${key}`
      await db.projectSetting.upsert({
        where: { projectId_key: { projectId: id, key: settingKey } },
        update: { value, version: { increment: 1 } },
        create: { projectId: id, key: settingKey, value },
      })
    }
    const rows = await db.projectSetting.findMany({
      where: { projectId: id, key: { startsWith: 'report.' } },
    })
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return ok<ReportSettingsDto>({
      westinghouseMode: (map['report.westinghouseMode'] as ReportSettingsDto['westinghouseMode']) ?? DEFAULTS.westinghouseMode,
      paperSize: (map['report.paperSize'] as ReportSettingsDto['paperSize']) ?? DEFAULTS.paperSize,
      orientation: (map['report.orientation'] as ReportSettingsDto['orientation']) ?? DEFAULTS.orientation,
    })
  })
}
