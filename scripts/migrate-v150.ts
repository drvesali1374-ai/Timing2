// ═══════════════════════════════════════════════════════════
// مهاجرت v1.5.0 — حذف مفهوم کاربری «نوع عنصر کاری» (§۳.۳)
//  ۱) backfill پیش‌فرض‌های فنی مستقل از نوع عنصر:
//     elementType → defaultEntryMode / defaultLaneType
//       MANUAL          → SEQ     / OPERATOR
//       MACHINE, OVERLAP→ INT     / MACHINE
//       WAITING         → INT     / OPERATOR
//  ۲) آرشیو نرم روابط فعال بین عناصر دو Activity متفاوت با دلیل
//     CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET (§۴.۳) —
//     بدون حذف هیچ ObservationOverlap تاریخی.
// idempotent — اجرای مکرر بی‌اثر است.
// ═══════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CROSS_ACTIVITY_REASON = 'CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET'

async function migrateElementDefaults(): Promise<{ backfilled: number }> {
  const elements = await prisma.workElement.findMany({
    select: { id: true, elementType: true, defaultEntryMode: true, defaultLaneType: true },
  })
  let backfilled = 0
  for (const el of elements) {
    const entryMode = el.elementType === 'MANUAL' ? 'SEQ' : 'INT'
    const laneType = el.elementType === 'MACHINE' || el.elementType === 'OVERLAP' ? 'MACHINE' : 'OPERATOR'
    if (el.defaultEntryMode === entryMode && el.defaultLaneType === laneType) continue
    await prisma.workElement.update({
      where: { id: el.id },
      data: { defaultEntryMode: entryMode, defaultLaneType: laneType },
    })
    backfilled++
  }
  return { backfilled }
}

async function archiveCrossActivityRelations(): Promise<{ archived: number }> {
  // فقط عناصری که هنوز وجود دارند را واکشی می‌کنیم؛ رابطه‌های مرجع به عنصر
  // حذف‌شده قبلاً توسط archiveRelationsForElement آرشیو شده‌اند.
  const elements = await prisma.workElement.findMany({
    select: { id: true, activityId: true },
  })
  const activityOf = new Map(elements.map((e) => [e.id, e.activityId]))
  const relations = await prisma.overlapRelation.findMany({ where: { isActive: true } })
  let archived = 0
  for (const rel of relations) {
    const a1 = activityOf.get(rel.elementLowId)
    const a2 = activityOf.get(rel.elementHighId)
    // هر دو عنصر موجود و در یک Activity نیستند → آرشیو نرم با دلیل
    if (a1 && a2 && a1 !== a2) {
      await prisma.overlapRelation.update({
        where: { id: rel.id },
        data: { isActive: false, archiveReason: CROSS_ACTIVITY_REASON, version: { increment: 1 } },
      })
      await prisma.auditEvent.create({
        data: {
          entityType: 'OverlapRelation',
          entityId: rel.id,
          action: 'DELETE',
          entityName: 'آرشیو خودکار رابطهٔ بین‌فعالیت (مهاجرت v1.5.0)',
          afterJson: JSON.stringify({ isActive: false, archiveReason: CROSS_ACTIVITY_REASON }),
          projectId: rel.projectId,
          actor: 'کاربر محلی',
        },
      })
      archived++
    }
  }
  return { archived }
}

async function main() {
  const r1 = await migrateElementDefaults()
  const r2 = await archiveCrossActivityRelations()
  console.log(
    JSON.stringify({ ok: true, backfilledElements: r1.backfilled, archivedCrossActivityRelations: r2.archived })
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
