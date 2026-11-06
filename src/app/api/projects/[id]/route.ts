// پروژه — جزئیات/ویرایش/حذف دائمی — FR-01 / FR-26
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getProjectDetail, updateProject, deleteProject } from '@/application/project-service'
import { projectUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getProjectDetail(id))
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = projectUpdateSchema.parse(await readJson(req))
    const project = await updateProject(id, body)
    return ok({ project })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    // پیش از حذف، شمارش وابستگی‌ها برای پیام تأیید در دسترس است (GET همین مسیر)
    await deleteProject(id)
    return ok({ deleted: true })
  })
}
