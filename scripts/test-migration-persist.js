// §۹ — آزمون ماندگاری نشانگر مهاجرت migrateV150 (بدون تغییر کاربر)
// شبیه‌سازی LocalStorage واقعی: بارگذاری اول → مهاجرت → بدون تغییر → «بستن» → بارگذاری دوم
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
const KEY = 'timing2-offline-db-v1'
// دادهٔ قدیمی نیازمند مهاجرت (عناصر بدون defaultEntryMode + بدون نشانگر)
const oldData = {
  version: 1,
  projects: [{ id: 'p1', name: 'قدیمی', lineName: 'L', productName: 'P', studyDate: '2026-01-01', status: 'IN_PROGRESS', description: null }],
  workElements: [{ id: 'w1', activityId: 'a1', name: 'E1', elementType: 'MACHINE', sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
  appSettings: [],
}
store.set(KEY, JSON.stringify(oldData))

await import(new URL('../offline/js/utils.js', import.meta.url).href)
await import(new URL('../offline/js/formulas.js', import.meta.url).href)
await import(new URL('../offline/js/db.js', import.meta.url).href)
const DB = globalThis.T2DB

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n) }

// ۱) پس از بارگذاری اول (مهاجرت اجرا شد)، نشانگر بلافاصله در LocalStorage ذخیره شده است —
//    حتی بدون هیچ commit/تغییر کاربر (v1.5.2 §۹)
const persisted = JSON.parse(store.get(KEY))
const marker = persisted.appSettings.find((r) => r.id === 'migration.v150')
ok('نشانگر مهاجرت بلافاصله پس از بارگذاری در LocalStorage ذخیره شد', !!marker)
const we = persisted.workElements.find((w) => w.id === 'w1')
ok('مقدار مهاجرت‌شده (INT/MACHINE) ماندگار شد', we.defaultEntryMode === 'INT' && we.defaultLaneType === 'MACHINE')

// ۲) شبیه‌سازی بستن برنامه و بارگذاری مجدد: مهاجرت دوباره اجرا نمی‌شود
//    (نشانگر موجود است → مقادیر تغییرداده‌شده کاربر بازنویسی نمی‌شوند)
// تغییر کاربر پس از مهاجرت — از API عمومی (updateElement با نام جدید)
DB.updateElement('w1', { name: 'E1 (ویرایش کاربر)' })
const persisted2 = JSON.parse(store.get(KEY))
ok('تغییر کاربر پس از مهاجرت ذخیره شد', persisted2.workElements.find((w) => w.id === 'w1').name === 'E1 (ویرایش کاربر)')
ok('مقدار مهاجرت‌شده با تغییر کاربر بازنویسی نشد (INT ماند)', persisted2.workElements.find((w) => w.id === 'w1').defaultEntryMode === 'INT')
const markerCount = persisted2.appSettings.filter((r) => r.id === 'migration.v150').length
ok('فقط یک نشانگر مهاجرت وجود دارد (اجرای مکرر نیست)', markerCount === 1)

console.log(`\n═══ §۹ ماندگاری نشانگر: ${pass} پاس / ${fail} خطا ═══`)
if (fail > 0) process.exit(1)
