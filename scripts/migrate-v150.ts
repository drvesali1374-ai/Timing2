// ═══════════════════════════════════════════════════════════
// مهاجرت v1.5.0 — حذف مفهوم کاربری «نوع عنصر کاری» (§۳.۳)
//  ۱) backfill پیش‌فرض‌های فنی مستقل از نوع عنصر:
//     elementType → defaultEntryMode / defaultLaneType
//       MANUAL          → SEQ     / OPERATOR
//       MACHINE, OVERLAP→ INT     / MACHINE
//       WAITING         → INT     / OPERATOR
//
// v1.5.1 §۹ — سیاست آرشیو روابط بین‌فعالیت (CROSS_ACTIVITY_
// NOT_SUPPORTED_BY_SESSION_SHEET) لغو شد:
//  • archiveCrossActivityRelations دیگر به عنوان سیاست جاری اجرا نمی‌شود.
//  • رابطهٔ فعال بین دو Activity هرگز آرشیو نمی‌شود.
//  • روابطی که قبلاً (در v1.5.0) با همین دلیل آرشیو شده‌اند، به صورت
//    خودکار فعال نمی‌شوند — کاربر باید از UI آگاهانه Restore کند.
//  • مقدارهای تاریخی ObservationOverlap هرگز حذف یا بازنویسی نمی‌شوند.
// idempotent — اجرای مکرر بی‌اثر است.
// ═══════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateElementDefaults(): Promise<{ backfilled: number }> {
  const elements = await prisma.workElement.findMany({
    select: { id: true, elementType: true, defaultEntryMode: true, defaultLaneType: true },
  })
  let backfilled = 0
  for (const el of elements) {
    // v1.5.1 — فقط مقدارهای تهی/ناموجود پر می‌شوند؛ مقدارهای معتبر
    // موجود (مثلاً تنظیم‌شده توسط کاربر) هرگز بازنویسی نمی‌شوند.
    if (el.defaultEntryMode != null && el.defaultLaneType != null) continue
    const entryMode = el.elementType === 'MANUAL' ? 'SEQ' : 'INT'
    const laneType = el.elementType === 'MACHINE' || el.elementType === 'OVERLAP' ? 'MACHINE' : 'OPERATOR'
    await prisma.workElement.update({
      where: { id: el.id },
      data: {
        defaultEntryMode: el.defaultEntryMode ?? entryMode,
        defaultLaneType: el.defaultLaneType ?? laneType,
      },
    })
    backfilled++
  }
  return { backfilled }
}

async function main() {
  const r1 = await migrateElementDefaults()
  console.log(
    JSON.stringify({
      ok: true,
      backfilledElements: r1.backfilled,
      archivedCrossActivityRelations: 0,
      note: 'v1.5.1: روابط بین‌فعالیت دیگر آرشیو نمی‌شوند؛ روابط آرشیوشدهٔ قبلی از UI قابل بازگردانی‌اند',
    })
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
