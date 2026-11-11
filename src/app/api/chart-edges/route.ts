// ایجاد اتصال دستی بین دو گره (انشعاب) — فاز ۵ «اتصال گره‌ها»
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { createChartEdge } from '@/application/chart-service'
import { chartEdgeCreateSchema } from '@/domain/validation'
import { AppError } from '@/domain/types'

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId')
    if (!projectId) throw new AppError('PROJECT_REQUIRED', 'شناسه پروژه الزامی است.', 422)
    const body = chartEdgeCreateSchema.parse(await readJson(req))
    const edge = await createChartEdge(projectId, body.sourceNodeId, body.targetNodeId, {
      sourceAnchor: body.sourceAnchor,
      targetAnchor: body.targetAnchor,
    })
    return ok({ edge }, 201)
  })
}
