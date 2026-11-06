// تاریخچه تغییرات — FR-27
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { listAudit } from '@/infrastructure/audit'

export function GET(req: NextRequest) {
  return handle(req, async () => {
    const url = new URL(req.url)
    const result = await listAudit({
      projectId: url.searchParams.get('projectId') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? '50'),
      offset: Number(url.searchParams.get('offset') ?? '0'),
    })
    return ok({ items: result.items, total: result.total })
  })
}
