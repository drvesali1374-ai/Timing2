// ═══════════════════════════════════════════════════════════
// اسکریپت مهاجرت الونس‌ها به مدل سلسله‌مراتبی — جلسه اول (§۴)
// اجرا:  bun scripts/migrate-allowances.ts
// • تبدیل AllowanceCategory → AllowanceDefinition (حفظ ID)
// • مقدار مؤثر قدیم هر فعالیت (دسته فعال + GroupAllowance +
//   اولویت ActivityAllowanceOverride) → تخصیص ACTIVITY
// • WorkElement بدون تخصیص تکراری — از Activity ارث می‌برد
// • قابل تکرار — مارکر ProjectSetting (اجرای مجدد بدون اثر)
// • گزارش قبل/بعد + مقایسه ST روی فعالیت‌های دارای داده
// ═══════════════════════════════════════════════════════════
export {}

async function main() {
  process.env.DATABASE_URL ??= 'file:./db/custom.db'
  const { migrateAllProjects } = await import('../src/application/effective-allowance-service')
  const { db } = await import('../src/lib/db')

  const reports = await migrateAllProjects()
  console.log('═'.repeat(60))
  console.log('مهاجرت الونس‌ها — گزارش نهایی')
  console.log('═'.repeat(60))
  for (const r of reports) {
    if (!r.migrated) {
      console.log(`◻ پروژه ${r.projectId}: از قبل مهاجرت‌شده (مارکر v2 موجود)`)
      continue
    }
    console.log(`✔ پروژه ${r.projectId}:`)
    console.log(`   تعریف ساخته‌شده: ${r.definitionsCreated}`)
    console.log(`   تخصیص ساخته‌شده (سطح فعالیت): ${r.assignmentsCreated}`)
    console.log(`   فعالیت پردازش‌شده: ${r.activitiesProcessed}`)
    console.log(`   مقادیر دسته غیرفعال نادیده: ${r.skippedInactiveCategories}`)
    for (const issue of r.issues) console.log(`   ⚠ ${issue}`)
  }

  // شمارش نهایی جداول
  const [defs, assigns, cats, gas, ovds] = await Promise.all([
    db.allowanceDefinition.count(),
    db.allowanceAssignment.count(),
    db.allowanceCategory.count(),
    db.groupAllowance.count(),
    db.activityAllowanceOverride.count(),
  ])
  console.log('─'.repeat(60))
  console.log(`تعریف‌های مرکزی: ${defs} | تخصیص‌ها: ${assigns}`)
  console.log(`legacy: دسته ${cats} | مقدار گروه ${gas} | بازنویسی فعالیت ${ovds} (حفظ شدند — §۴.۱.۸)`)
  console.log('═'.repeat(60))
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect()
}

main().catch((err) => {
  console.error('خطای مهاجرت:', err)
  process.exit(1)
})
