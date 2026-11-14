'use client'

// ═══════════════════════════════════════════════════════════
// نمای داده و پشتیبان — FR-24 / FR-25 / FR-26 / FR-27 【F1】
// زبانه ۱: پشتیبان‌گیری خودکار/دستی، فهرست نسخه‌ها، بازیابی
// زبانه ۲: بسته کامل پروژه (خروجی/ورود)
// زبانه ۳: تاریخچه تغییرات با جزئیات قبل/بعد
// ═══════════════════════════════════════════════════════════
import { Fragment, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArchiveRestore,
  ChevronDown,
  Clock,
  DatabaseBackup,
  Download,
  FileUp,
  HardDriveDownload,
  History,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpDot } from '@/components/common/HelpDot'
import { SectionHeading } from '@/components/common/SectionHeading'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { auditApi, backupsApi, settingsApi, type AuditDto, type BackupDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { useIsMobile } from '@/hooks/use-mobile'
import type { DisplayPrefs } from '@/lib/format'
import { formatDateTime, formatInt, formatTimeValue } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── انواع و ثابت‌ها ──
interface RestoreResult {
  restored: Record<string, number>
  removedByMarkers?: number
  protectiveBackupId?: string
}

type RestoreTarget =
  | { kind: 'record'; id: string; label: string; info: string }
  | { kind: 'file'; file: File; label: string; info: string }

const KIND_META: Record<string, { label: string; badgeCls: string }> = {
  AUTO: { label: 'خودکار', badgeCls: 'border-0 bg-cyan-soft text-cyan' },
  MANUAL: { label: 'دستی', badgeCls: 'border-0 bg-green-soft text-green' },
  PRE_RESTORE: { label: 'حفاظتی', badgeCls: 'border-0 bg-amber-soft text-amber' },
}

const AUDIT_ACTION_META: Record<string, { label: string; badgeCls: string }> = {
  CREATE: { label: 'ایجاد', badgeCls: 'border-0 bg-green-soft text-green' },
  UPDATE: { label: 'ویرایش', badgeCls: 'border-0 bg-brand-soft text-brand' },
  DELETE: { label: 'حذف', badgeCls: 'border-0 bg-red-soft text-red' },
  RESTORE: { label: 'بازیابی', badgeCls: 'border-0 bg-cyan-soft text-cyan' },
  BACKUP: { label: 'پشتیبان', badgeCls: 'border-0 bg-amber-soft text-amber' },
  EXPORT: { label: 'خروجی', badgeCls: 'border-0 bg-amber-soft text-amber' },
  IMPORT: { label: 'ورود', badgeCls: 'border-0 bg-amber-soft text-amber' },
  DUPLICATE: { label: 'کپی', badgeCls: 'border-0 bg-amber-soft text-amber' },
  FINALIZE: { label: 'نهایی‌سازی', badgeCls: 'border-0 bg-amber-soft text-amber' },
}

const ENTITY_LABELS: Record<string, string> = {
  Project: 'پروژه',
  Station: 'ایستگاه',
  Activity: 'فعالیت',
  WorkElement: 'عنصر کاری',
  Operator: 'اپراتور',
  ActivityGroup: 'گروه فعالیت',
  AllowanceCategory: 'دسته مجاز',
  RatingTable: 'جدول ارزیابی',
  RatingAssessment: 'ارزیابی',
  Backup: 'پشتیبان',
}

const INTERVAL_MINUTES = [5, 10, 15, 30, 60, 120, 240]
const RETENTION_COUNTS = [3, 5, 10, 20, 50]

/** حجم پشتیبان با واحدهای فارسی */
function formatBackupSize(bytes: number, prefs: DisplayPrefs): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes >= 1024 * 1024) return `${formatTimeValue(bytes / (1024 * 1024), prefs, 1)} مگابایت`
  if (bytes >= 1024) return `${formatTimeValue(bytes / 1024, prefs, 1)} کیلوبایت`
  return `${formatInt(bytes, prefs)} بایت`
}

/** تجزیه امن JSON شیء‌شکل */
function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    // JSON نامعتبر — نادیده گرفته می‌شود
    return null
  }
}

/** نمایش مقدار Audit به‌صورت متن کوتاه */
function fmtAuditValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (value === '') return '(خالی)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export default function DataView({ projectId }: { projectId: string }) {
  return (
    <div className="animate-view-in mx-auto max-w-5xl space-y-5">
      {/* سربرگ — چسبان زیر نوار اصلی (v1.5.2 §۸) */}
      <SectionHeading>
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <DatabaseBackup className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">داده و پشتیبان</h1>
            <p className="text-xs text-muted-foreground">
              پشتیبان‌گیری و بازیابی، بسته پروژه و تاریخچه تغییرات
            </p>
          </div>
        </div>
      </SectionHeading>

      <Tabs defaultValue="backups" dir="rtl" className="gap-4">
        <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="backups" className="gap-1.5 text-xs sm:text-sm">
            <HardDriveDownload className="size-4" aria-hidden />
            پشتیبان‌گیری
          </TabsTrigger>
          <TabsTrigger value="package" className="gap-1.5 text-xs sm:text-sm">
            <Package className="size-4" aria-hidden />
            بسته پروژه
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs sm:text-sm">
            <History className="size-4" aria-hidden />
            تاریخچه تغییرات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backups">
          <BackupTab />
        </TabsContent>

        <TabsContent value="package">
          <PackageTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// زبانه ۱ — پشتیبان‌گیری و بازیابی — FR-24
// ═══════════════════════════════════════════════════════════
function BackupTab() {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const isMobile = useIsMobile()

  // ── تنظیمات پشتیبان خودکار ──
  const settingsQuery = useQuery({
    queryKey: qk.settings(),
    queryFn: () => settingsApi.get(),
  })
  const [autoEnabled, setAutoEnabled] = useState(true)
  const [intervalMinutes, setIntervalMinutes] = useState('30')
  const [retention, setRetention] = useState('10')

  const settings = settingsQuery.data?.settings
  useEffect(() => {
    if (!settings) return
    setAutoEnabled(settings['backup.autoEnabled'] === 'true')
    setIntervalMinutes(settings['backup.intervalMinutes'] ?? '30')
    setRetention(settings['backup.retention'] ?? '10')
  }, [settings])

  const applySetting = async (values: Record<string, string>) => {
    try {
      await settingsApi.put(values)
      toast.success('تنظیمات پشتیبان‌گیری ذخیره شد')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ذخیره تنظیمات ناموفق بود')
    } finally {
      void qc.invalidateQueries({ queryKey: qk.settings() })
    }
  }

  const intervalOptions = INTERVAL_MINUTES.map((m) => ({
    value: String(m),
    label:
      m < 60
        ? `هر ${formatInt(m, prefs)} دقیقه`
        : `هر ${formatInt(m / 60, prefs)} ساعت`,
  }))
  const retentionOptions = RETENTION_COUNTS.map((n) => ({
    value: String(n),
    label: `نگهداری ${formatInt(n, prefs)} نسخه خودکار`,
  }))

  // ── فهرست پشتیبان‌ها ──
  const backupsQuery = useQuery({
    queryKey: qk.backups(),
    queryFn: () => backupsApi.list(),
  })
  const backups = backupsQuery.data?.items ?? []
  const health = backupsQuery.data?.health

  // ── پشتیبان دستی ──
  const [creating, setCreating] = useState(false)
  const openDownload = (id: string) => {
    const win = window.open(`/api/backups/${id}/download`)
    if (!win) toast.error('مرورگر پنجره دانلود را مسدود کرد؛ مجوز پاپ‌آپ مرورگر را بررسی کنید.')
  }
  const createManual = async () => {
    setCreating(true)
    try {
      const rec = await backupsApi.createManual()
      void qc.invalidateQueries({ queryKey: qk.backups() })
      toast.success('پشتیبان دستی ساخته شد', {
        description: `نام فایل: ${rec.fileName}`,
        action: { label: 'دانلود', onClick: () => openDownload(rec.id) },
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ایجاد پشتیبان دستی ناموفق بود')
    } finally {
      setCreating(false)
    }
  }

  // ── بازیابی (از رکورد یا فایل) — با تأیید صریح ──
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null)
  const [restoring, setRestoring] = useState(false)

  const uploadInputRef = useRef<HTMLInputElement>(null)
  const onUploadPicked = (file: File) => {
    setRestoreTarget({
      kind: 'file',
      file,
      label: file.name,
      info: `فایل انتخابی · ${formatBackupSize(file.size, prefs)}`,
    })
  }

  const doRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const res: RestoreResult | null =
        restoreTarget.kind === 'file'
          ? ((await backupsApi.restoreUpload(restoreTarget.file)) as RestoreResult | null)
          : ((await backupsApi.restore(restoreTarget.id)) as RestoreResult | null)
      const rows = Object.values(res?.restored ?? {}).reduce((sum, n) => sum + n, 0)
      // کل داده پایگاه جایگزین شده است — کل کش نامعتبر و بازخوانی می‌شود (FR-24)
      qc.clear()
      toast.success('بازیابی با موفقیت انجام شد', {
        description: `${formatInt(rows, prefs)} ردیف داده بازگردانی شد. پیش از جایگزینی، یک نسخه پشتیبان حفاظتی نیز گرفته شد.`,
      })
      setRestoreTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'بازیابی ناموفق بود')
    } finally {
      setRestoring(false)
    }
  }

  // ── حذف نسخه پشتیبان ──
  const [deleting, setDeleting] = useState<BackupDto | null>(null)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => backupsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.backups() })
      toast.success('نسخه پشتیبان حذف شد')
      setDeleting(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف نسخه پشتیبان ناموفق بود'),
  })

  const restoreInfo = (b: BackupDto) =>
    `${formatDateTime(b.createdAt, prefs)} · ${formatBackupSize(b.sizeBytes, prefs)} · نسخه ساختار ${b.schemaVersion} · ${formatInt(b.projectCount, prefs)} پروژه`

  return (
    <div className="space-y-4">
      {/* تنظیمات پشتیبان‌گیری خودکار */}
      <section className="card-premium p-5" aria-label="تنظیمات پشتیبان‌گیری خودکار">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-cyan-soft text-cyan">
            <Clock className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-extrabold">پشتیبان‌گیری خودکار</h2>
            <p className="text-xs text-muted-foreground">
              زمان‌بندی روی سرور محلی اعمال می‌شود؛ نسخه‌ها روی دیسک همین دستگاه ذخیره می‌شوند.
            </p>
          </div>
        </div>

        {settingsQuery.isLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : settingsQuery.error ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-soft/60 p-3 text-xs text-red">
            <span>
              {settingsQuery.error instanceof Error
                ? settingsQuery.error.message
                : 'خطا در بارگذاری تنظیمات'}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void qc.invalidateQueries({ queryKey: qk.settings() })}
            >
              تلاش مجدد
            </Button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
              <div className="flex items-center gap-1">
                <Label htmlFor="backup-auto">فعال‌سازی خودکار</Label>
                <HelpDot
                  label="پشتیبان‌گیری خودکار"
                  content={{
                    what: 'پشتیبان‌گیری خودکار کل پایگاه داده (پروژه‌ها، تنظیمات و تاریخچه) را در فاصله‌های زمانی مشخص روی دیسک محلی ذخیره می‌کند.',
                    note: 'پشتیبان‌گیری جایگزین ذخیره لحظه‌ای نیست؛ ذخیره تغییرات هر فرم بلافاصله انجام می‌شود.',
                  }}
                />
              </div>
              <Switch
                id="backup-auto"
                checked={autoEnabled}
                onCheckedChange={(checked) => {
                  setAutoEnabled(checked)
                  void applySetting({ 'backup.autoEnabled': String(checked) })
                }}
                aria-label="فعال‌سازی پشتیبان‌گیری خودکار"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>فاصله زمانی</Label>
                <HelpDot
                  label="فاصله پشتیبان‌گیری"
                  content={{
                    what: 'هر چند وقت یک‌بار پشتیبان خودکار گرفته شود.',
                    note: 'اگر از آخرین نسخه کمتر از این فاصله گذشته باشد، تیک بعدی رد می‌شود.',
                  }}
                />
              </div>
              <Select
                dir="rtl"
                value={intervalMinutes}
                onValueChange={(v) => {
                  setIntervalMinutes(v)
                  void applySetting({ 'backup.intervalMinutes': v })
                }}
                disabled={!autoEnabled}
              >
                <SelectTrigger className="w-full" aria-label="فاصله زمانی پشتیبان‌گیری خودکار">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervalOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="num">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>سیاست نگهداری</Label>
                <HelpDot
                  label="سیاست نگهداری نسخه‌ها"
                  content={{
                    what: 'تعداد نسخه‌های خودکار که نگه داشته می‌شوند؛ نسخه‌های قدیمی‌تر پس از عبود از این تعداد حذف می‌شوند.',
                    note: 'نسخه‌های دستی و حفاظتی مشمول این سیاست نمی‌شوند.',
                  }}
                />
              </div>
              <Select
                dir="rtl"
                value={retention}
                onValueChange={(v) => {
                  setRetention(v)
                  void applySetting({ 'backup.retention': v })
                }}
                disabled={!autoEnabled}
              >
                <SelectTrigger className="w-full" aria-label="سیاست نگهداری نسخه‌های خودکار">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="num">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </section>

      {/* پشتیبان دستی و بازیابی از فایل */}
      <section className="card-premium p-5" aria-label="پشتیبان دستی و بازیابی">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-green-soft text-green">
            <HardDriveDownload className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-extrabold">پشتیبان دستی و بازیابی</h2>
            <p className="text-xs text-muted-foreground">
              هر زمان که لازم بود یک نسخه کامل بگیرید یا از فایل پشتیبان بازیابی کنید.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => void createManual()} disabled={creating} className="btn-brand gap-1.5 border-0">
            {creating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {creating ? 'در حال ایجاد…' : 'ایجاد پشتیبان دستی'}
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => uploadInputRef.current?.click()}
          >
            <FileUp className="size-4" aria-hidden />
            بازیابی از فایل
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="انتخاب فایل پشتیبان برای بازیابی"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onUploadPicked(file)
              e.target.value = ''
            }}
          />
        </div>
        <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
          پشتیبان‌ها در پوشه محلی سرور ذخیره می‌شوند؛ با دکمه دانلود می‌توانید نسخه دلخواه را روی سیستم
          خود نگه دارید.
        </p>
      </section>

      {/* فهرست نسخه‌های پشتیبان */}
      <section aria-label="فهرست نسخه‌های پشتیبان" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold">نسخه‌های پشتیبان</h2>
            <p className="num text-xs text-muted-foreground">
              {formatInt(backups.length, prefs)} نسخه ثبت‌شده
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void qc.invalidateQueries({ queryKey: qk.backups() })}
            aria-label="تازه‌سازی فهرست پشتیبان‌ها"
          >
            <RotateCcw className="size-4" aria-hidden />
          </Button>
        </div>

        {(health?.missing.length ?? 0) > 0 && (
          <p className="rounded-xl bg-amber-soft p-3 text-xs leading-6 text-muted-foreground">
            <b className="text-amber">هشدار سلامت فایل: </b>
            برخی فایل‌های پشتیبان روی دیسک یافت نشدند؛ رکورد آن‌ها برای پیگیری باقی مانده است ولی
            دانلود و بازیابی ممکن نیست.
          </p>
        )}

        {backupsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : backupsQuery.error ? (
          <EmptyState
            title="بارگذاری فهرست پشتیبان‌ها ناموفق بود"
            description={
              backupsQuery.error instanceof Error
                ? backupsQuery.error.message
                : 'خطای نامشخص در ارتباط با سرور'
            }
            action={
              <Button
                variant="outline"
                onClick={() => void qc.invalidateQueries({ queryKey: qk.backups() })}
              >
                تلاش مجدد
              </Button>
            }
          />
        ) : backups.length === 0 ? (
          <EmptyState
            icon={<DatabaseBackup className="size-7" aria-hidden />}
            title="هنوز نسخه پشتیبانی ثبت نشده است"
            description="با ایجاد اولین نسخه پشتیبان شروع کنید؛ پشتیبان شامل همه پروژه‌ها، تنظیمات و تاریخچه است."
            action={
              <Button onClick={() => void createManual()} disabled={creating} className="btn-brand gap-1.5 border-0">
                <Plus className="size-4" aria-hidden />
                ایجاد پشتیبان دستی
              </Button>
            }
          />
        ) : isMobile ? (
          /* کارت موبایل — FR-30 */
          <div className="space-y-3">
            {backups.map((b) => {
              const missing = health?.missing.includes(b.fileName) ?? false
              return (
                <BackupMobileCard
                  key={b.id}
                  backup={b}
                  missing={missing}
                  prefs={prefs}
                  onDownload={() => openDownload(b.id)}
                  onRestore={() =>
                    setRestoreTarget({ kind: 'record', id: b.id, label: b.fileName, info: restoreInfo(b) })
                  }
                  onDelete={() => setDeleting(b)}
                />
              )
            })}
          </div>
        ) : (
          /* جدول دسکتاپ */
          <div className="card-premium overflow-hidden">
            <div className="scroll-slim max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-2 text-right text-xs text-muted-foreground">
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 font-bold">نوع</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 font-bold">تاریخ ایجاد</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 font-bold">حجم</th>
                    <th className="num sticky top-0 z-10 bg-surface-2 px-4 py-3 font-bold">پروژه‌ها</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 font-bold">Checksum</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3 font-bold">وضعیت</th>
                    <th className="sticky top-0 z-10 bg-surface-2 px-4 py-3" aria-label="عملیات" />
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => {
                    const missing = health?.missing.includes(b.fileName) ?? false
                    return (
                      <tr
                        key={b.id}
                        className="border-b last:border-0 transition-colors hover:bg-muted/50"
                      >
                        <td className="px-4 py-3">
                          <KindBadge kind={b.kind} />
                        </td>
                        <td className="num px-4 py-3 text-xs text-muted-foreground">
                          {formatDateTime(b.createdAt, prefs)}
                        </td>
                        <td className="num px-4 py-3 text-xs">{formatBackupSize(b.sizeBytes, prefs)}</td>
                        <td className="num px-4 py-3 text-xs text-muted-foreground">
                          {formatInt(b.projectCount, prefs)}
                        </td>
                        <td className="px-4 py-3">
                          <code
                            className="num rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                            dir="ltr"
                            title={b.checksum}
                          >
                            {b.checksum.slice(0, 8)}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          {missing ? (
                            <Badge className="border-0 bg-red-soft text-red">فایل گمشته</Badge>
                          ) : (
                            <Badge className="border-0 bg-green-soft text-green">سالم</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={missing}
                              onClick={() => openDownload(b.id)}
                              aria-label={`دانلود ${b.fileName}`}
                            >
                              <Download className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-cyan hover:text-cyan"
                              disabled={missing}
                              onClick={() =>
                                setRestoreTarget({
                                  kind: 'record',
                                  id: b.id,
                                  label: b.fileName,
                                  info: restoreInfo(b),
                                })
                              }
                              aria-label={`بازیابی ${b.fileName}`}
                            >
                              <ArchiveRestore className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-red hover:text-red"
                              onClick={() => setDeleting(b)}
                              aria-label={`حذف ${b.fileName}`}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* تأیید بازیابی — FR-24 (تأیید صریح و توضیح اثر جایگزینی) */}
      <RestoreConfirmDialog
        target={restoreTarget}
        loading={restoring}
        onConfirm={() => void doRestore()}
        onCancel={() => setRestoreTarget(null)}
      />

      {/* تأیید حذف نسخه پشتیبان */}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف نسخه پشتیبان"
        entityName={deleting?.fileName ?? ''}
        dependencies={{}}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// زبانه ۲ — بسته کامل پروژه — FR-25
// ═══════════════════════════════════════════════════════════
function PackageTab({ projectId }: { projectId: string }) {
  const navigate = useAppStore((s) => s.navigate)

  const exportPackage = () => {
    const win = window.open(`/api/projects/${projectId}/export`)
    if (!win) {
      toast.error('مرورگر پنجره دانلود را مسدود کرد؛ مجوز پاپ‌آپ مرورگر را بررسی کنید.')
      return
    }
    toast.success('خروجی بسته آغاز شد', {
      description: 'فایل بسته کامل این پروژه دانلود می‌شود؛ شامل manifest و checksum.',
    })
  }

  return (
    <div className="card-premium overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-surface-2/60 p-5">
        <div className="chip-icon bg-brand-soft text-brand">
          <Package className="size-6" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">بسته خروجی کامل پروژه</h2>
          <p className="text-xs text-muted-foreground">انتقال کامل یک مطالعه بین نصب‌های این نرم‌افزار</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm leading-7 text-muted-foreground">
          بسته شامل manifest، مشخصات پروژه، ساختار تولید، تنظیمات، گروه‌های مجاز، داده‌های خام،
          ارزیابی وستینگهاوس و تاریخچه است. فایل با نسخه ساختار داده (schema) و checksum برای تشخیص
          خرابی همراه است.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportPackage} className="btn-brand gap-1.5 border-0">
            <Download className="size-4" aria-hidden />
            خروجی بسته کامل این پروژه
          </Button>
          <Button variant="outline" onClick={() => navigate({ name: 'home' })} className="gap-1.5">
            <FileUp className="size-4" aria-hidden />
            ورود بسته (از صفحه خانه)
          </Button>
        </div>
        <p className="rounded-xl bg-amber-soft p-3 text-xs leading-6 text-muted-foreground">
          <b className="text-amber">نکته مهم: </b>
          ورود بسته همیشه پروژه جدید می‌سازد و پروژه موجود را بازنویسی نمی‌کند. دکمه «ورود بسته» در
          نوار ابزار صفحه خانه در دسترس است؛ پیش از واردکردن، ساختار، شناسه‌ها، نسخه و صحت فایل
          اعتبارسنجی می‌شود و هیچ کد اجرایی از بسته اجرا نمی‌شود.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// زبانه ۳ — تاریخچه تغییرات — FR-27
// ═══════════════════════════════════════════════════════════
function AuditTab({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: qk.audit(projectId),
    queryFn: () => auditApi.list(projectId, 100),
  })
  const items = data?.items ?? []

  return (
    <div className="space-y-3">
      <p className="text-sm leading-7 text-muted-foreground">
        آخرین تغییرات مهم این مطالعه با زمان، نوع عمل، موجودیت، مقدار قبل/بعد و عامل. برای حذف دائمی،
        مطابق سیاست Audit حداقلی، محتوای حذف‌شده بازنگه داشته می‌شود.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="بارگذاری تاریخچه ناموفق بود"
          description={error instanceof Error ? error.message : 'خطای نامشخص در ارتباط با سرور'}
          action={
            <Button variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: qk.audit(projectId) })}>
              تلاش مجدد
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History className="size-7" aria-hidden />}
          title="هنوز رویدادی ثبت نشده است"
          description="با ایجاد و ویرایش داده‌ها در این مطالعه، رویدادهای مهم به‌صورت خودکار در تاریخچه ثبت می‌شوند."
        />
      ) : (
        <>
          <p className="num text-xs text-muted-foreground">
            {formatInt(data?.total ?? items.length, prefs)} رویداد — نمایش حداکثر{' '}
            {formatInt(100, prefs)} رویداد اخیر
          </p>

          {isMobile ? (
            /* کارت موبایل — FR-30 */
            <div className="space-y-3">
              {items.map((a) => (
                <AuditMobileCard
                  key={a.id}
                  item={a}
                  expanded={expandedId === a.id}
                  onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  prefs={prefs}
                />
              ))}
            </div>
          ) : (
            /* جدول دسکتاپ با ردیف قابل بازشدن */
            <div className="card-premium overflow-hidden">
              <div className="scroll-slim max-h-[32rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-surface-2 text-right text-xs text-muted-foreground">
                      <th className="sticky top-0 z-10 bg-surface-2 px-3 py-3 font-bold">زمان</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-3 py-3 font-bold">عمل</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-3 py-3 font-bold">موجودیت</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-3 py-3 font-bold">نام</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-3 py-3 font-bold">عامل</th>
                      <th className="sticky top-0 z-10 bg-surface-2 px-3 py-3" aria-label="جزئیات" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a) => (
                      <Fragment key={a.id}>
                        <tr className="border-b last:border-0 transition-colors hover:bg-muted/40">
                          <td className="num px-3 py-2.5 text-xs text-muted-foreground">
                            {formatDateTime(a.occurredAt, prefs)}
                          </td>
                          <td className="px-3 py-2.5">
                            <ActionBadge action={a.action} />
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {ENTITY_LABELS[a.entityType] ?? a.entityType}
                          </td>
                          <td className="max-w-40 truncate px-3 py-2.5" title={a.entityName ?? undefined}>
                            {a.entityName ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {a.actor || 'کاربر محلی'}
                          </td>
                          <td className="px-3 py-2.5 text-left">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                              aria-label={expandedId === a.id ? 'بستن جزئیات' : 'نمایش جزئیات'}
                              aria-expanded={expandedId === a.id}
                            >
                              <ChevronDown
                                className={cn(
                                  'size-4 transition-transform',
                                  expandedId === a.id && 'rotate-180'
                                )}
                                aria-hidden
                              />
                            </Button>
                          </td>
                        </tr>
                        {expandedId === a.id && (
                          <tr className="border-b bg-muted/30">
                            <td colSpan={6} className="px-4 py-3">
                              <AuditDiff item={a} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── اجزای کوچک مشترک ──

function KindBadge({ kind }: { kind: string }) {
  const meta = KIND_META[kind]
  if (!meta) {
    return (
      <Badge className="border-0 bg-muted text-muted-foreground">{kind}</Badge>
    )
  }
  return <Badge className={meta.badgeCls}>{meta.label}</Badge>
}

function ActionBadge({ action }: { action: string }) {
  const meta = AUDIT_ACTION_META[action]
  if (!meta) {
    return (
      <Badge className="border-0 bg-muted text-muted-foreground">{action}</Badge>
    )
  }
  return <Badge className={meta.badgeCls}>{meta.label}</Badge>
}

/** کارت موبایل نسخه پشتیبان — FR-30 */
function BackupMobileCard({
  backup: b,
  missing,
  prefs,
  onDownload,
  onRestore,
  onDelete,
}: {
  backup: BackupDto
  missing: boolean
  prefs: DisplayPrefs
  onDownload: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  return (
    <div className="card-premium space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={b.kind} />
          {missing && <Badge className="border-0 bg-red-soft text-red">فایل گمشته</Badge>}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={onDownload} disabled={missing} aria-label={`دانلود ${b.fileName}`}>
            <Download className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-cyan hover:text-cyan"
            onClick={onRestore}
            disabled={missing}
            aria-label={`بازیابی ${b.fileName}`}
          >
            <ArchiveRestore className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-red hover:text-red"
            onClick={onDelete}
            aria-label={`حذف ${b.fileName}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <p className="num text-xs text-muted-foreground">{formatDateTime(b.createdAt, prefs)}</p>
      <div className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
        <span>{formatBackupSize(b.sizeBytes, prefs)}</span>·
        <span>{formatInt(b.projectCount, prefs)} پروژه</span>·
        <span className="font-mono" dir="ltr" title={b.checksum}>
          {b.checksum.slice(0, 8)}
        </span>
        <span>· نسخه ساختار {b.schemaVersion}</span>
      </div>
    </div>
  )
}

/** کارت موبایل رویداد تاریخچه — FR-30 */
function AuditMobileCard({
  item,
  expanded,
  onToggle,
  prefs,
}: {
  item: AuditDto
  expanded: boolean
  onToggle: () => void
  prefs: DisplayPrefs
}) {
  return (
    <div className="card-premium p-4">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 text-right"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <ActionBadge action={item.action} />
            <span className="text-xs">{ENTITY_LABELS[item.entityType] ?? item.entityType}</span>
          </div>
          <p className="mt-1.5 truncate text-sm font-bold">{item.entityName ?? '—'}</p>
          <p className="num mt-0.5 text-[11px] text-faint">
            {formatDateTime(item.occurredAt, prefs)}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />
      </button>
      {expanded && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-[11px] text-muted-foreground">عامل: {item.actor || 'کاربر محلی'}</p>
          <AuditDiff item={item} />
        </div>
      )}
    </div>
  )
}

/** نمایش تغییرات قبل/بعد یک رویداد — FR-27 */
function AuditDiff({ item }: { item: AuditDto }) {
  if (item.action === 'DELETE') {
    return (
      <p className="rounded-xl bg-red-soft/60 p-3 text-xs leading-6 text-muted-foreground">
        <b className="text-red">حذف دائمی: </b>
        بدون محتوای حذف‌شده (Audit حداقلی) — فقط نوع موجودیت، شناسه، زمان و عامل ثبت شده است.
      </p>
    )
  }
  const before = parseJsonObject(item.beforeJson)
  const after = parseJsonObject(item.afterJson)
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  if (keys.length === 0) {
    return (
      <p className="text-xs leading-6 text-muted-foreground">
        جزئیات قبل/بعد برای این رویداد ثبت نشده است.
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      {keys.map((key) => (
        <div
          key={key}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-muted px-3 py-1.5 text-xs"
        >
          <span className="min-w-24 font-bold">{key}:</span>
          <span className="min-w-0 break-all text-red" title="مقدار قبل">
            {fmtAuditValue(before?.[key])}
          </span>
          <span aria-hidden>←</span>
          <span className="min-w-0 break-all font-bold text-green" title="مقدار بعد">
            {fmtAuditValue(after?.[key])}
          </span>
        </div>
      ))}
    </div>
  )
}

/** تأیید صریح بازیابی — FR-24 (اثر جایگزینی داده‌ها) */
function RestoreConfirmDialog({
  target,
  loading,
  onConfirm,
  onCancel,
}: {
  target: RestoreTarget | null
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !loading) onCancel()
      }}
    >
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber">
            <ArchiveRestore className="size-5" aria-hidden />
            بازیابی نسخه پشتیبان
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-right">
              {target && (
                <div className="rounded-xl bg-muted p-3 text-xs leading-6">
                  <p className="font-bold">{target.label}</p>
                  <p className="num text-muted-foreground">{target.info}</p>
                </div>
              )}
              <p className="text-sm leading-7">
                تمام داده‌های فعلی با محتوای این نسخه جایگزین می‌شود. پیش از جایگزینی، یک پشتیبان
                حفاظتی خودکار گرفته می‌شود. نشانگرهای حذف دائمی اعمال می‌شوند و داده‌های حذف‌شده
                عمداً بازنمی‌گردند.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={loading}>انصراف</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            className="gap-1.5 bg-brand text-white hover:bg-brand/90"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArchiveRestore className="size-4" aria-hidden />
            )}
            {loading ? 'در حال بازیابی…' : 'بازیابی و جایگزینی'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
