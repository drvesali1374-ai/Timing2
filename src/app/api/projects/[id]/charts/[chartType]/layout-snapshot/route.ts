// snapshot آخرین چیدمان دستی نمودار — قبل از Auto Layout ذخیره و قابل بازگردانی — جلسه ۲ §۱۵.۵
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertChartType } from '@/application/chart-service'

type Ctx = { params: Promise<{ id: string; chartType: string }> }

const snapshotSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      positionX: z.number(),
      positionY: z.number(),
    })
  ),
  canvas: z.object({ width: z.number(), height: z.number() }),
  savedAt: z.string().optional(),
})

export interface ChartLayoutSnapshotDto {
  nodes: Array<{ id: string; positionX: number; positionY: number }>
  canvas: { width: number; height: number }
  savedAt: string | null
}

function settingKey(chartType: string) {
  return `chart.layoutSnapshot.${chartType}`
}

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id, chartType } = await ctx.params
    assertChartType(chartType)
    const row = await db.projectSetting.findUnique({
      where: { projectId_key: { projectId: id, key: settingKey(chartType) } },
    })
    if (!row) return ok<ChartLayoutSnapshotDto | null>(null)
    try {
      const parsed = snapshotSchema.parse(JSON.parse(row.value))
      return ok<ChartLayoutSnapshotDto>({ ...parsed, savedAt: parsed.savedAt ?? null })
    } catch {
      return ok<ChartLayoutSnapshotDto | null>(null)
    }
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id, chartType } = await ctx.params
    assertChartType(chartType)
    const body = snapshotSchema.parse(await readJson(req))
    const value = JSON.stringify({ ...body, savedAt: body.savedAt ?? new Date().toISOString() })
    await db.projectSetting.upsert({
      where: { projectId_key: { projectId: id, key: settingKey(chartType) } },
      update: { value, version: { increment: 1 } },
      create: { projectId: id, key: settingKey(chartType), value },
    })
    return ok({ saved: true })
  })
}
