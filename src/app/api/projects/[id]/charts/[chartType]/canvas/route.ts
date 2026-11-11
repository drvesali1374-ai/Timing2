// ابعاد بوم نمودار — مستقل از zoom و اندازهٔ PDF — جلسه ۲ §۱۵.۶
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { z } from 'zod'
import { db } from '@/lib/db'
import { assertChartType } from '@/application/chart-service'

type Ctx = { params: Promise<{ id: string; chartType: string }> }

const canvasSchema = z.object({
  width: z.number().min(600).max(20000),
  height: z.number().min(400).max(20000),
})

export interface ChartCanvasDto {
  width: number
  height: number
}

function settingKey(chartType: string) {
  return `chart.canvas.${chartType}`
}

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id, chartType } = await ctx.params
    assertChartType(chartType)
    const row = await db.projectSetting.findUnique({
      where: { projectId_key: { projectId: id, key: settingKey(chartType) } },
    })
    if (!row) return ok<ChartCanvasDto | null>(null)
    try {
      return ok<ChartCanvasDto>(JSON.parse(row.value))
    } catch {
      return ok<ChartCanvasDto | null>(null)
    }
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id, chartType } = await ctx.params
    assertChartType(chartType)
    const body = canvasSchema.parse(await readJson(req))
    await db.projectSetting.upsert({
      where: { projectId_key: { projectId: id, key: settingKey(chartType) } },
      update: { value: JSON.stringify(body), version: { increment: 1 } },
      create: { projectId: id, key: settingKey(chartType), value: JSON.stringify(body) },
    })
    return ok<ChartCanvasDto>(body)
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id, chartType } = await ctx.params
    assertChartType(chartType)
    await db.projectSetting.deleteMany({ where: { projectId: id, key: settingKey(chartType) } })
    return ok({ reset: true })
  })
}
