// بسته خروجی کامل پروژه — FR-25
import { NextRequest } from 'next/server'
import { handle } from '@/lib/api-helpers'
import { exportProjectPackage } from '@/infrastructure/package-io'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const pkg = await exportProjectPackage(id)
    return new Response(JSON.stringify(pkg, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="project-package-${id.slice(0, 8)}.json"`,
      },
    })
  })
}
