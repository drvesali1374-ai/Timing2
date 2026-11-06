// پروژه‌ها — فهرست/جستجو/مرتب‌سازی/ایجاد — FR-01
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listProjects, createProject } from '@/application/project-service'
import { projectCreateSchema } from '@/domain/validation'

export function GET(req: NextRequest) {
  return handle(req, async () => {
    const url = new URL(req.url)
    const items = await listProjects({
      q: url.searchParams.get('q') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
      dir: (url.searchParams.get('dir') as 'asc' | 'desc') ?? undefined,
    })
    return ok({ items })
  })
}

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const body = projectCreateSchema.parse(await readJson(req))
    const project = await createProject(body)
    return ok({ project }, 201)
  })
}
