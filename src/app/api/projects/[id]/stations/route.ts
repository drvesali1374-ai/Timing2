// ایستگاه‌ها — FR-02
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listStations, createStation } from '@/application/structure-service'
import { stationCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const items = await listStations(id)
    return ok({ items })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = stationCreateSchema.parse(await readJson(req))
    const station = await createStation(id, body)
    return ok({ station }, 201)
  })
}
