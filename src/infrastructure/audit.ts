// ═══════════════════════════════════════════════════════════
// زیرساخت — ثبت رویدادهای تاریخچه — FR-27 / ۲.۳
// عامل تغییر همیشه «کاربر محلی» است (نبود احراز هویت)
// برای حذف دائمی: قبل/بعد ثبت نمی‌شود (Audit حداقلی — FR-26)
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'IMPORT'
  | 'EXPORT'
  | 'BACKUP'
  | 'FINALIZE'
  | 'DUPLICATE'
  | 'REORDER'

export interface AuditEntry {
  entityType: string
  entityId: string
  action: AuditAction
  entityName?: string | null
  before?: unknown
  after?: unknown
  projectId?: string | null
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  // حذف دائمی: محتوای حذف‌شده در Audit کپی نمی‌شود — FR-26
  const isDelete = entry.action === 'DELETE'
  await db.auditEvent.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      entityName: entry.entityName ?? null,
      beforeJson: isDelete ? null : safeJson(entry.before),
      afterJson: isDelete ? null : safeJson(entry.after),
      projectId: entry.projectId ?? null,
      actor: 'کاربر محلی',
    },
  })
}

function safeJson(v: unknown): string | null {
  if (v === undefined || v === null) return null
  try {
    return JSON.stringify(v)
  } catch {
    return null
  }
}

/** فهرست تاریخچه با فیلتر پروژه */
export async function listAudit(params: { projectId?: string; limit?: number; offset?: number }) {
  const where = params.projectId ? { projectId: params.projectId } : {}
  const [items, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: Math.min(params.limit ?? 50, 200),
      skip: params.offset ?? 0,
    }),
    db.auditEvent.count({ where }),
  ])
  return { items, total }
}
