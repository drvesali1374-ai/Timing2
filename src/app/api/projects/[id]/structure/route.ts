// درخت کامل ساختار تولید — FR-02
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { getStructureTree } from '@/application/structure-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const tree = await getStructureTree(id)
    return ok({ stations: tree })
  })
}
