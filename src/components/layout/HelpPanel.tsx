'use client'

// ═══════════════════════════════════════════════════════════
// پنل راهنمای مرحله — FR-28 / ۷.۲
// باز و بسته شدن فقط از دکمه لامپ هدر؛ پنل به‌صورت Overlay
// روی محتوا باز می‌شود (بدون اشغال عرض صفحه) و پس‌زمینه آن
// کاملاً کدر است تا اجزای پشت آن دیده نشوند.
// ═══════════════════════════════════════════════════════════
import { useQuery } from '@tanstack/react-query'
import { Lightbulb, ListChecks, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { projectsApi } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore } from '@/store/app-store'
import { STUDY_STAGES, STAGE_STATUS_LABELS, type StageStatus } from '@/domain/types'
import { cn } from '@/lib/utils'

/** محتوای راهنمای هر مرحله — از محتوای واقعی قواعد همان مرحله */
const STAGE_GUIDES: Record<string, { steps: string[]; next: string }> = {
  info: {
    steps: [
      'نام پروژه، خط تولید، محصول و تاریخ مطالعه را کامل کنید.',
      'روش اعمال مجاز را انتخاب کنید: درصدی از زمان نرمال یا سهم از زمان استاندارد.',
      'روش تجمیع چند اپراتور را در تنظیمات محاسبات مشخص کنید.',
    ],
    next: 'سپس به «ساختار تولید» بروید و ایستگاه‌ها را ثبت کنید.',
  },
  structure: {
    steps: [
      'ایستگاه‌های خط تولید را اضافه و با Drag & Drop مرتب کنید.',
      'برای هر ایستگاه، فعالیت‌ها را با نوع فرایندی (عملیات/بازرسی/حمل‌ونقل/تأخیر/انبارش) ثبت کنید.',
      'برای هر فعالیت، عناصر کاری را با نوع (دستی/ماشین/انتظار/هم‌زمان) تعریف کنید.',
      'شناسه عناصر پایدار است؛ تغییر نام ارتباط تاریخی را از بین نمی‌برد.',
    ],
    next: 'سپس اپراتورها را معرفی و گروه‌های مجاز را تعریف کنید.',
  },
  operators: {
    steps: [
      'هر اپراتور را با نام نمایشی و کد داخلی ثبت کنید.',
      'اپراتور در سطح پروژه تعریف می‌شود و در چند فعالیت شرکت می‌کند.',
      'برگه زمان‌سنجی هر اپراتور برای هر فعالیت مستقل خواهد بود (فاز ۳).',
    ],
    next: 'سپس «گروه‌ها و مجازها» را تنظیم کنید.',
  },
  allowances: {
    steps: [
      'دسته‌های مجاز پروژه را تعریف کنید (مثلاً استراحت شخصی، نیازهای طبیعی، خستگی).',
      'گروه‌های فعالیت بسازید و درصد هر دسته را در سطح گروه تعیین کنید.',
      'فعالیت را به گروه تخصیص دهید؛ مقادیر به‌صورت ارث‌بری اعمال می‌شوند.',
      'در صورت نیاز، هر دسته را در سطح فعالیت بازنویسی (Override) کنید.',
    ],
    next: 'سپس ارزیابی وستینگهاوس عناصر را انجام دهید.',
  },
  westinghouse: {
    steps: [
      'جدول مرجع و منبع/نسخه آن را بازبینی کنید؛ جدول Seed صرفاً نقطه شروع است.',
      'برای هر عنصر کاری، چهار عامل مهارت/تلاش/شرایط/یکنواختی را ارزیابی کنید.',
      'ضریب R = ۱ + مجموع عوامل؛ برای هر عنصر یک‌بار ثبت و به همه مشاهدات همان عنصر اعمال می‌شود.',
      'در صورت نیاز، ارزیابی را از عنصر مشابه کپی کنید.',
    ],
    next: 'سپس در «زمان‌سنجی» جلسه بسازید و چرخه‌ها را ثبت کنید.',
  },
  timing: {
    steps: [
      'جلسه = فعالیت × اپراتور × روش کرنومتر؛ برای هر ترکیب جلسهٔ جدا بسازید.',
      'روش را انتخاب کنید: برگشت به صفر (مقدار مستقل) یا پیوسته (قرائت تجمعی؛ تفاضل خودکار محاسبه می‌شود).',
      'مقادیر را دستی وارد یا از Excel چندسلولی Paste کنید؛ پیش‌نمایش تطبیق ستون‌ها را ببینید.',
      'برای عناصر هم‌زمان، در جزئیات چرخه بازهٔ مستقل (شروع/پایان) ثبت کنید؛ زمان سپری‌شده از گسترهٔ بازه‌ها به دست می‌آید نه جمع مدت‌ها.',
      'خطای ورودی و دادهٔ مشکوک نمایش داده می‌شود؛ دادهٔ مشکوک فقط هشدار است و حذف نمی‌شود.',
    ],
    next: 'سپس «تحلیل نتایج» را بازبینی کنید و مشکوک‌ها را تصمیم‌گیری کنید.',
  },
  analysis: {
    steps: [
      'کارت‌های خلاصه را ببینید: پیشرفت نمونه، مشاهدات در محاسبات و نیازمند بازبینی.',
      'برای هر عنصر، آمار کامل (میانگین، میانه، SD، CV و بازهٔ اطمینان) و OT/NT/ST را بازبینی کنید.',
      'مشاهدات مشکوک را بررسی کنید: نگه‌داشتن (هشدار ≠ حذف) یا خروج با ثبت دلیل — دادهٔ خام همیشه حفظ می‌شود.',
      'تغییر پارامتر مؤثر (ارزیابی، مجاز، روش) نتیجه را «نیازمند محاسبهٔ مجدد» می‌کند؛ با دکمهٔ اجرای محاسبه نسخهٔ جدید ثبت کنید.',
    ],
    next: 'سپس «نمودار فرایند» را بازبینی و در پایان از «داشبورد» شاخص‌ها را ببینید.',
  },
  charts: {
    steps: [
      'با بازکردن این مرحله، گره‌ها خودکار از فعالیت‌ها ساخته می‌شوند (OPC: عملیات/بازرسی؛ FPC: هر پنج نوع).',
      'توالی را با اتصال گره‌ها یا دکمه‌های ترتیب بالا/پایین کامل کنید.',
      'گرهٔ دستی اضافی (مثلاً کنترل کیفیت) را در صورت نیاز اضافه کنید.',
      'با درگ، چیدمان را شخصی کنید؛ مختصات ذخیره می‌شود و چیدمان خودکار جای آن را نمی‌گیرد.',
    ],
    next: 'سپس «داشبورد» را برای شاخص‌های کلان و «گزارش‌ها» را برای خروجی باز کنید.',
  },
  dashboard: {
    steps: [
      'ابتدا کارت‌های خلاصه: زمان استاندارد (در صورت قابل محاسبه بودن)، میانگین چرخه، تعداد نمونه و وضعیت هدف.',
      'اگر داده کافی نباشد، کارت علت را نشان می‌دهد — هرگز صفر یا مقدار ساختگی نمی‌بینید.',
      'نمودارهای تخصصی را در بخش‌های بازشونده ببینید: مقایسهٔ فعالیت‌ها، توزیع وضعیت، اپراتورها و پراکندگی.',
      'از «شخصی‌سازی»، کارت‌ها و نمودارها را مرتب یا مخفی کنید؛ چیدمان ذخیره می‌شود.',
      'بخش «نیازهای بازبینی» موارد باقی‌مانده را با میان‌بر اقدام نشان می‌دهد.',
    ],
    next: 'در پایان، گزارش رسمی را از «گزارش‌ها» تهیه و نهایی‌سازی کنید.',
  },
  reports: {
    steps: [
      'نوع گزارش Excel را انتخاب کنید: نگاه کل، خلاصهٔ محاسبات، مقایسهٔ اپراتورها یا داده‌های خام.',
      'با فیلتر فعالیت/اپراتور، خروجی را محدود کنید؛ فیلتر هم روی Excel و هم گزارش رسمی اعمال می‌شود.',
      'گزارش رسمی (پیش‌نمایش کاغذ A4) شامل فرمول‌ها، روش کرنومتر، وستینگهاوس، مجازها و داده‌های خارج‌شده است.',
      'با «چاپ / ذخیره PDF» از پنجرهٔ چاپ مرورگر، PDF بومی و کاملاً آفلاین بسازید.',
      'گزارش، نتیجهٔ نیازمند بازبینی را استاندارد قطعی معرفی نمی‌کند و موارد بازبینی را فهرست می‌کند.',
    ],
    next: 'با اطمینان از داده‌ها، مطالعه را از «مشخصات پروژه» نهایی کنید (ویرایش باز می‌ماند).',
  },
}

export function HelpPanel({ projectId }: { projectId: string }) {
  const { helpOpen, setHelpOpen, view } = useAppStore()
  const stage = view.name === 'project' ? view.stage : 'structure'
  const guide = STAGE_GUIDES[stage]
  const { data: summary } = useQuery({
    queryKey: qk.projectSummary(projectId),
    queryFn: () => projectsApi.summary(projectId),
  })
  const stageState = summary?.stages[stage]

  // بسته = هیچ اشغال عرضی ندارد؛ باز = Overlay روی محتوا (کدر، غیرشفاف)
  if (!helpOpen) return null

  const stageMeta = STUDY_STAGES.find((s) => s.key === stage)

  return (
    <aside
      className="no-print scroll-slim fixed bottom-0 end-0 top-14 z-30 w-72 max-w-[85vw] overflow-y-auto border-s bg-surface-2 p-4 shadow-[10px_0_28px_-14px_rgba(15,23,42,0.35)]"
      aria-label="راهنمای مرحله"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-amber-soft text-amber">
            <ListChecks className="size-4.5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-extrabold">راهنمای مرحله</p>
            <p className="text-[11px] text-muted-foreground">{stageMeta?.label}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setHelpOpen(false)} aria-label="بستن راهنمای مرحله">
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      {summary && stageState && stageState.status !== 'FUTURE_PHASE' && (
        <div className="mb-3 rounded-xl bg-card p-3 shadow-[var(--shadow-1)]">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            وضعیت این مرحله:
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px]',
                stageState.status === 'DONE' && 'bg-green-soft text-green',
                stageState.status === 'IN_PROGRESS' && 'bg-cyan-soft text-cyan',
                stageState.status === 'NEEDS_REVIEW' && 'bg-amber-soft text-amber',
                stageState.status === 'PENDING' && 'bg-muted text-muted-foreground'
              )}
            >
              {STAGE_STATUS_LABELS[stageState.status as StageStatus]}
            </span>
          </p>
          <p className="text-xs leading-6 text-muted-foreground">{stageState.hint}</p>
        </div>
      )}

      {guide ? (
        <ol className="space-y-2">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl bg-card p-2.5 text-xs leading-6 shadow-[var(--shadow-1)]">
              <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">
                {(i + 1).toLocaleString('fa-IR')}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
          <li className="rounded-xl bg-brand-soft p-2.5 text-xs leading-6">
            <b className="text-accent-foreground">اقدام بعدی پیشنهادی: </b>
            <span className="text-muted-foreground">{guide.next}</span>
          </li>
        </ol>
      ) : (
        <p className="rounded-xl bg-card p-3 text-xs leading-6 text-muted-foreground shadow-[var(--shadow-1)]">
          راهنمای اختصاصی این بخش در فاز مربوط به آن تکمیل می‌شود. برای فیلدهای موجود، از آیکون راهنمای
          کنار هر فیلد استفاده کنید.
        </p>
      )}

      <button
        type="button"
        onClick={() => setHelpOpen(false)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-[11px] text-faint transition-colors hover:border-brand/40 hover:text-brand"
      >
        <Lightbulb className="size-3.5" aria-hidden />
        بستن پنل راهنما
      </button>
    </aside>
  )
}
