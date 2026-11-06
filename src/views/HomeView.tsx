'use client'

// ═══════════════════════════════════════════════════════════
// نمای خانه — مدیریت پروژه‌ها — FR-01 【F1】
// جستجو/مرتب‌سازی، ایجاد، ویرایش با ذخیره خودکار (FR-23)،
// کپی انتخابی بخش‌ها، ورود/خروجی بسته (FR-25) و
// حذف دائمی با شمارش وابستگی‌ها (FR-26)
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Copy,
  Download,
  Factory,
  FileUp,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Rocket,
  Search,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { HelpDot } from '@/components/common/HelpDot'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { useAutosave } from '@/hooks/use-autosave'
import { JalaliDatePicker } from '@/components/common/JalaliDatePicker'
import { ProjectStatusBadge } from '@/components/common/StatusBadge'
import { ThemeToggle } from '@/components/layout/TopBar'
import { AppFooter } from '@/components/layout/AppFooter'
import { projectsApi, type ProjectSummaryItem } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import type { DisplayPrefs } from '@/lib/format'
import { formatDate, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── فرم‌ها و ثابت‌ها ──
interface ProjectForm {
  name: string
  lineName: string
  productName: string
  studyDate: string | null
  description: string
}

interface DuplicateSections {
  structureAndSettings: boolean
  operators: boolean
  groupsAndAllowances: boolean
  ratingTables: boolean
  rawObservations: boolean
}

type SortKey = 'recent' | 'name' | 'progress'

const SORT_OPTIONS: Record<SortKey, { sort: string; dir: string; label: string }> = {
  recent: { sort: 'createdAt', dir: 'desc', label: 'اخیراً ایجادشده' },
  name: { sort: 'name', dir: 'asc', label: 'نام (الفبایی)' },
  progress: { sort: 'progress', dir: 'desc', label: 'بیشترین پیشرفت' },
}

const FIRST_USE_KEY = 'timing-first-use-dismissed'

/** محتوای راهنمای فیلدهای پروژه — FR-28 */
const FIELD_HELP = {
  name: {
    what: 'عنوان این مطالعه زمان‌سنجی؛ در فهرست پروژه‌ها، سایدبار و گزارش‌های رسمی نمایش داده می‌شود.',
    input: 'نام کوتاه و قابل تشخیص؛ می‌تواند شامل مدل یا کد محصول باشد.',
    example: '«مطالعه خط مونتاژ پمپ آب مدل A»',
    note: 'شناسه داخلی پروژه پایدار است؛ تغییر نام، تاریخچه و بسته‌های خروجی قبلی را بی‌اعتبار نمی‌کند.',
  },
  lineName: {
    what: 'نام خط تولیدی که مطالعه روی آن انجام می‌شود؛ هر پروژه دقیقاً یک خط تولید دارد.',
    input: 'نام رسمی خط در کارخانه.',
    example: '«خط مونتاژ ۱» یا «خط پرداخت کاری»',
  },
  productName: {
    what: 'محصولی که روی این خط تولید می‌شود؛ مبنای مقایسه مطالعات مختلفِ همان محصول است.',
    input: 'نام تجاری یا مدل محصول.',
    example: '«پمپ آب مدل A»',
  },
  studyDate: {
    what: 'تاریخ رسمی انجام مطالعه؛ در سربرگ گزارش‌های رسمی درج می‌شود.',
    input: 'از تقویم شمسی انتخاب کنید یا قالب ۱۴۰۴/۰۸/۱۳ را دستی وارد کنید.',
    note: 'در پایگاه داده ISO میلادی ذخیره می‌شود؛ نمایش شمسی فقط لایه نمایش است.',
  },
} as const

export default function HomeView() {
  const prefs = useDisplayPrefs()
  const navigate = useAppStore((s) => s.navigate)
  const qc = useQueryClient()

  // ── جستجو با debounce ساده ۳۰۰ms ──
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchText.trim()), 300)
    return () => clearTimeout(t)
  }, [searchText])

  // ── مرتب‌سازی ──
  const [sortBy, setSortBy] = useState<SortKey>('recent')
  const sortCfg = SORT_OPTIONS[sortBy]

  // ── حالت دیالوگ‌ها ──
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<ProjectForm>({
    name: '',
    lineName: '',
    productName: '',
    studyDate: null,
    description: '',
  })
  const [editing, setEditing] = useState<ProjectSummaryItem | null>(null)
  const [dupTarget, setDupTarget] = useState<ProjectSummaryItem | null>(null)

  // ── حذف دائمی — ابتدا وابستگی‌ها دریافت می‌شود (FR-26) ──
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummaryItem | null>(null)
  const [deleteDeps, setDeleteDeps] = useState<Record<string, number> | null>(null)
  const [depsLoading, setDepsLoading] = useState(false)
  const cancelDepsRef = useRef(false)

  // ── ورود بسته ──
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  // ── بنر اولین استفاده ──
  const [firstUseDismissed, setFirstUseDismissed] = useState(true)
  useEffect(() => {
    try {
      setFirstUseDismissed(window.localStorage.getItem(FIRST_USE_KEY) === '1')
    } catch {
      // localStorage در دسترس نیست — بنر نمایش داده می‌شود
      setFirstUseDismissed(false)
    }
  }, [])

  const listParams = { q: query || undefined, sort: sortCfg.sort, dir: sortCfg.dir }
  const { data, isLoading, error } = useQuery({
    queryKey: qk.projects(listParams),
    queryFn: () => projectsApi.list(listParams),
  })

  // مرتب‌سازی روی کلاینت نیز اعمال می‌شود تا برچسب انتخابی همیشه صادق بماند
  const projects = useMemo(() => {
    const items = [...(data?.items ?? [])]
    if (sortBy === 'name') items.sort((a, b) => a.name.localeCompare(b.name, 'fa'))
    else if (sortBy === 'progress') items.sort((a, b) => b.progress - a.progress)
    else items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return items
  }, [data, sortBy])

  const invalidateProjects = () => {
    void qc.invalidateQueries({ queryKey: ['projects'] })
  }

  const openProject = (id: string) => navigate({ name: 'project', projectId: id, stage: 'info' })

  // ── ایجاد پروژه ──
  const createMutation = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name: createForm.name.trim(),
        lineName: createForm.lineName.trim(),
        productName: createForm.productName.trim(),
        studyDate: createForm.studyDate,
        description: createForm.description.trim() || null,
      }),
    onSuccess: (res) => {
      invalidateProjects()
      toast.success('پروژه ایجاد شد')
      setCreateOpen(false)
      setCreateForm({ name: '', lineName: '', productName: '', studyDate: null, description: '' })
      openProject(res.project.id)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ایجاد پروژه ناموفق بود'),
  })

  // ── حذف دائمی ──
  const requestDelete = async (p: ProjectSummaryItem) => {
    cancelDepsRef.current = false
    setDeleteTarget(p)
    setDeleteDeps(null)
    setDepsLoading(true)
    try {
      const detail = await projectsApi.get(p.id)
      if (cancelDepsRef.current) return
      setDeleteDeps({
        'ایستگاه‌ها': detail.dependencyCounts.stations,
        'فعالیت‌ها': detail.dependencyCounts.activities,
        'عناصر کاری': detail.dependencyCounts.elements,
        'اپراتورها': detail.dependencyCounts.operators,
        'گروه‌های مجاز': detail.dependencyCounts.groups,
        'جلسات زمان‌سنجی': detail.dependencyCounts.sessions,
        'مشاهدات خام': detail.dependencyCounts.observations,
      })
    } catch (err) {
      if (!cancelDepsRef.current) {
        toast.error(err instanceof Error ? err.message : 'دریافت وابستگی‌های پروژه ناموفق بود')
        setDeleteTarget(null)
      }
    } finally {
      setDepsLoading(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      invalidateProjects()
      toast.success('پروژه به‌طور دائمی حذف شد')
      setDeleteTarget(null)
      setDeleteDeps(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف پروژه ناموفق بود'),
  })

  // ── خروجی بسته کامل ──
  const exportProject = (p: ProjectSummaryItem) => {
    const win = window.open(`/api/projects/${p.id}/export`)
    if (!win) {
      toast.error('مرورگر پنجره دانلود را مسدود کرد؛ مجوز پاپ‌آپ مرورگر را بررسی کنید.')
      return
    }
    toast.success('خروجی بسته آماده شد', {
      description: `فایل بسته کامل «${p.name}» دانلود می‌شود.`,
    })
  }

  // ── ورود بسته — همیشه پروژه جدید (FR-25) ──
  const onImportFile = async (file: File) => {
    setImporting(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/projects/import', { method: 'POST', body: form })
      const body = (await res.json().catch(() => null)) as
        | { projectId?: string; name?: string; error?: { message?: string } }
        | null
      if (!res.ok) throw new Error(body?.error?.message ?? 'ورود بسته ناموفق بود')
      invalidateProjects()
      toast.success(`بسته «${body?.name ?? 'پروژه'}» وارد شد`, {
        description: 'ورود بسته همیشه پروژه جدید می‌سازد؛ این پروژه با پسوند (ورودی) ساخته شد.',
      })
      // رفتن به پروژه تازه واردشده — FR-25
      if (body?.projectId) openProject(body.projectId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ورود بسته ناموفق بود')
    } finally {
      setImporting(false)
    }
  }

  const onDuplicated = (newProjectId: string, newName: string) => {
    invalidateProjects()
    setDupTarget(null)
    toast.success(`پروژه «${newName}» ساخته شد`, {
      description: 'کپی با بخش‌های انتخاب‌شده ایجاد شد.',
      action: { label: 'بازکردن', onClick: () => openProject(newProjectId) },
    })
  }

  const dismissFirstUse = () => {
    setFirstUseDismissed(true)
    try {
      window.localStorage.setItem(FIRST_USE_KEY, '1')
    } catch {
      // عدم دسترسی به localStorage مانع ادامه کار نمی‌شود
    }
  }

  const retryList = () => void qc.invalidateQueries({ queryKey: qk.projects(listParams) })

  return (
    <div className="flex min-h-screen flex-col">
      {/* هدر */}
      <header className="glass-bar sticky top-0 z-40 border-b no-print">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-[0_8px_20px_rgba(114,87,255,0.35)]">
            <Timer className="size-5.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold leading-tight">زمان‌سنجی صنعتی</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              مطالعات زمان استاندارد خطوط تولید — کاملاً آفلاین
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 p-4 md:p-6">
        {/* نوار ابزار — جستجو/مرتب‌سازی/ورود بسته/پروژه جدید */}
        <section
          aria-label="ابزار فهرست پروژه‌ها"
          className="card-premium flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                // جستجوی فوری با Enter — بدون انتظار برای debounce
                if (e.key === 'Enter') setQuery(searchText.trim())
              }}
              placeholder="جستجو در نام پروژه، خط تولید یا محصول…"
              className="pr-9"
              aria-label="جستجوی پروژه‌ها"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select dir="rtl" value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-full sm:w-44" aria-label="مرتب‌سازی پروژه‌ها">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_OPTIONS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_OPTIONS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileUp className="size-4" aria-hidden />
              )}
              <span className="hidden sm:inline">{importing ? 'در حال ورود…' : 'ورود بسته'}</span>
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="btn-brand gap-1.5 border-0">
              <Plus className="size-4" aria-hidden />
              پروژه جدید
            </Button>
          </div>
        </section>

        {/* بنر اولین استفاده */}
        {!isLoading && !error && projects.length === 0 && !firstUseDismissed && (
          <section className="card-premium overflow-hidden" aria-label="راهنمای اولین استفاده">
            <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-l from-brand-soft/70 to-transparent p-4">
              <div className="flex items-center gap-3">
                <div className="chip-icon bg-brand-soft text-brand">
                  <Rocket className="size-5" aria-hidden />
                </div>
                <div>
                  <h2 className="font-extrabold">خوش آمدید! شروع کار در سه مرحله</h2>
                  <p className="text-xs text-muted-foreground">
                    این برنامه کاملاً آفلاین کار می‌کند؛ داده‌ها روی همین دستگاه می‌مانند.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={dismissFirstUse}
                aria-label="بستن راهنمای اولین استفاده"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <ol className="grid gap-2 p-4 sm:grid-cols-3">
              {[
                'پروژه مطالعه بسازید — نام خط تولید، محصول و تاریخ مطالعه را ثبت کنید.',
                'ساختار خط (ایستگاه، فعالیت، عنصر کاری) و اپراتورها را تعریف کنید.',
                'گروه‌های مجاز و ارزیابی وستینگهاوس را تنظیم کنید؛ زمان‌سنجی و گزارش‌ها در فازهای بعدی فعال می‌شوند.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs leading-6">
                  <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                    {(i + 1).toLocaleString('fa-IR')}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="px-4 pb-4">
              <Button onClick={() => setCreateOpen(true)} className="btn-brand gap-1.5 border-0">
                <Plus className="size-4" aria-hidden />
                شروع: ایجاد اولین پروژه
              </Button>
            </div>
          </section>
        )}

        {/* محتوا */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Factory className="size-7" aria-hidden />}
            title="بارگذاری پروژه‌ها ناموفق بود"
            description={error instanceof Error ? error.message : 'خطای نامشخص در ارتباط با سرور'}
            action={
              <Button variant="outline" onClick={retryList}>
                تلاش مجدد
              </Button>
            }
          />
        ) : projects.length === 0 ? (
          query ? (
            <EmptyState
              icon={<Search className="size-7" aria-hidden />}
              title="پروژه‌ای مطابق جستجو یافت نشد"
              description={`عبارت «${query}» در نام پروژه‌ها، خطوط تولید یا محصولات یافت نشد. عبارت کوتاه‌تری را امتحان کنید.`}
              action={
                <Button variant="outline" onClick={() => setSearchText('')}>
                  پاک‌کردن جستجو
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Factory className="size-7" aria-hidden />}
              title="هنوز پروژه‌ای ثبت نشده است"
              description="هر پروژه یک مطالعه روی یک خط تولید و یک محصول مشخص است. با ایجاد اولین پروژه شروع کنید: مشخصات، ساختار خط، اپراتورها و تنظیمات مهندسی."
              action={
                <Button onClick={() => setCreateOpen(true)} className="btn-brand gap-1.5 border-0">
                  <Plus className="size-4" aria-hidden />
                  ایجاد اولین پروژه
                </Button>
              }
              className="mt-4"
            />
          )
        ) : (
          <>
            {query && (
              <p className="num text-xs text-muted-foreground">
                {formatInt(projects.length, prefs)} پروژه برای «{query}» یافت شد
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  prefs={prefs}
                  onOpen={() => openProject(p.id)}
                  onEdit={() => setEditing(p)}
                  onDuplicate={() => setDupTarget(p)}
                  onExport={() => exportProject(p)}
                  onDelete={() => void requestDelete(p)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* فوتر چسبان */}
      <AppFooter />

      {/* ورودی مخفی فایل بسته */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="انتخاب فایل بسته پروژه برای ورود"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onImportFile(file)
          e.target.value = ''
        }}
      />

      {/* دیالوگ ایجاد پروژه */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>پروژه جدید</DialogTitle>
            <DialogDescription>
              هر پروژه فقط یک خط تولید و یک محصول دارد. موارد ستاره‌دار الزامی‌اند.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">نام پروژه *</Label>
              <Input
                id="p-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="مثلاً: مطالعه خط مونتاژ پمپ"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-line">نام خط تولید *</Label>
              <Input
                id="p-line"
                value={createForm.lineName}
                onChange={(e) => setCreateForm((s) => ({ ...s, lineName: e.target.value }))}
                placeholder="مثلاً: خط مونتاژ ۱"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-product">نام محصول *</Label>
              <Input
                id="p-product"
                value={createForm.productName}
                onChange={(e) => setCreateForm((s) => ({ ...s, productName: e.target.value }))}
                placeholder="مثلاً: پمپ آب مدل A"
              />
            </div>
            <JalaliDatePicker
              label="تاریخ مطالعه *"
              value={createForm.studyDate}
              onChange={(iso) => setCreateForm((s) => ({ ...s, studyDate: iso }))}
              id="p-date"
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-desc">شرح (اختیاری)</Label>
              <Textarea
                id="p-desc"
                value={createForm.description}
                onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="هدف مطالعه، دامنه یا نکات مهم…"
                className="min-h-16"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button
              className="btn-brand border-0"
              disabled={
                createMutation.isPending ||
                !createForm.name.trim() ||
                !createForm.lineName.trim() ||
                !createForm.productName.trim() ||
                !createForm.studyDate
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'در حال ایجاد…' : 'ایجاد پروژه'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ویرایش — ذخیره خودکار — فقط هنگام باز بودن سوار می‌شود */}
      {editing && (
        <EditProjectDialog
          key={editing.id}
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidateProjects()
            void qc.invalidateQueries({ queryKey: qk.project(editing.id) })
          }}
        />
      )}

      {/* دیالوگ کپی پروژه — FR-01 */}
      {dupTarget && (
        <DuplicateProjectDialog
          key={dupTarget.id}
          project={{ id: dupTarget.id, name: dupTarget.name }}
          onClose={() => setDupTarget(null)}
          onDone={onDuplicated}
        />
      )}

      {/* دیالوگ انتظار دریافت وابستگی‌ها برای حذف */}
      <Dialog
        open={depsLoading}
        onOpenChange={(open) => {
          if (open) return
          cancelDepsRef.current = true
          setDeleteTarget(null)
          setDeleteDeps(null)
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-xs" aria-describedby={undefined}>
          <DialogTitle className="sr-only">بررسی وابستگی‌های پروژه</DialogTitle>
          <div className="flex flex-col items-center gap-3 py-4" role="status" aria-live="polite">
            <Loader2 className="size-6 animate-spin text-brand" aria-hidden />
            <p className="text-sm text-muted-foreground">در حال بررسی وابستگی‌های پروژه…</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف دائمی با وابستگی‌ها — FR-26 */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null && deleteDeps !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteDeps(null)
          }
        }}
        title="حذف دائمی پروژه"
        entityName={deleteTarget?.name ?? ''}
        dependencies={deleteDeps ?? {}}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// کارت پروژه — FR-01
// ═══════════════════════════════════════════════════════════
function ProjectCard({
  project: p,
  prefs,
  onOpen,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
}: {
  project: ProjectSummaryItem
  prefs: DisplayPrefs
  onOpen: () => void
  onEdit: () => void
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      aria-label={`بازکردن پروژه ${p.name}`}
      className="card-premium group cursor-pointer p-5 text-right focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Package className="size-5.5" aria-hidden />
        </div>
        <div className="flex items-center gap-1">
          <ProjectStatusBadge status={p.status} finalized={p.finalized} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`عملیات پروژه ${p.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onOpen}>
                <FolderOpen aria-hidden />
                بازکردن
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil aria-hidden />
                ویرایش
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy aria-hidden />
                کپی پروژه
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport}>
                <Download aria-hidden />
                خروجی بسته
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 aria-hidden />
                حذف دائمی
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <h2 className="mt-3 truncate font-extrabold group-hover:text-brand">{p.name}</h2>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        خط «{p.lineName}» · محصول «{p.productName}»
      </p>
      <p className="num mt-2 text-[11px] text-faint">تاریخ مطالعه: {formatDate(p.studyDate, prefs)}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">پیشرفت مطالعه</span>
          <span className="num font-bold text-brand">
            {formatInt(Math.round(p.progress * 100), prefs)}٪
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(p.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="درصد پیشرفت مطالعه"
        >
          <div
            className="h-full rounded-full bg-gradient-to-l from-brand to-brand-2 transition-all"
            style={{ width: `${Math.max(4, p.progress * 100)}%` }}
          />
        </div>
        <p className="num mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
          <span>{formatInt(p.counts.stations, prefs)} ایستگاه</span>·
          <span>{formatInt(p.counts.activities, prefs)} فعالیت</span>·
          <span>{formatInt(p.counts.elements, prefs)} عنصر</span>·
          <span>{formatInt(p.counts.operators, prefs)} اپراتور</span>
        </p>
      </div>

      <p className="mt-3 flex items-center gap-1 text-[11px] font-bold text-brand opacity-0 transition-opacity group-hover:opacity-100">
        ورود به پروژه
        <ArrowLeft className="size-3.5" aria-hidden />
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// دیالوگ ویرایش پروژه — ذخیره خودکار با کنترل هم‌زمانی — FR-23
// (فقط هنگام باز بودن mount می‌شود تا وضعیت اولیه فرم با
// آخرین داده سرور همگام باشد و ذخیره‌ی بی‌دلیل رخ ندهد)
// ═══════════════════════════════════════════════════════════
function EditProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectSummaryItem
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProjectForm>({
    name: project.name,
    lineName: project.lineName,
    productName: project.productName,
    studyDate: project.studyDate,
    description: project.description ?? '',
  })
  const updatedAtRef = useRef(project.updatedAt)
  const lastSaveErrorRef = useRef<string | null>(null)

  const { status, retry, flush } = useAutosave<ProjectForm>({
    data: form,
    ready: true,
    save: async (value) => {
      try {
        lastSaveErrorRef.current = null
        const res = await projectsApi.update(project.id, {
          name: value.name.trim(),
          lineName: value.lineName.trim(),
          productName: value.productName.trim(),
          studyDate: value.studyDate,
          description: value.description.trim() || null,
          expectedUpdatedAt: updatedAtRef.current,
        })
        updatedAtRef.current = res.project.updatedAt
        onSaved()
      } catch (err) {
        lastSaveErrorRef.current = err instanceof Error ? err.message : 'خطا در ذخیره‌سازی'
        throw err
      }
    },
  })

  /** بستن پس از flush — اگر ذخیره ناموفق باشد دیالوگ باز می‌ماند (FR-23) */
  const handleClose = async () => {
    await flush()
    if (lastSaveErrorRef.current) {
      toast.error('تغییرات ذخیره نشد', {
        description: 'پنجره باز نگه داشته شد تا تغییرات شما از بین نرود؛ دوباره تلاش کنید.',
      })
      return
    }
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void handleClose()
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ویرایش پروژه</DialogTitle>
          <DialogDescription>
            تغییرات به‌صورت خودکار ذخیره می‌شوند؛ نیازی به دکمه ذخیره نیست.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="edit-name">نام پروژه</Label>
              <HelpDot label="نام پروژه" content={FIELD_HELP.name} />
            </div>
            <Input
              id="edit-name"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="edit-line">نام خط تولید</Label>
              <HelpDot label="نام خط تولید" content={FIELD_HELP.lineName} />
            </div>
            <Input
              id="edit-line"
              value={form.lineName}
              onChange={(e) => setForm((s) => ({ ...s, lineName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="edit-product">نام محصول</Label>
              <HelpDot label="نام محصول" content={FIELD_HELP.productName} />
            </div>
            <Input
              id="edit-product"
              value={form.productName}
              onChange={(e) => setForm((s) => ({ ...s, productName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="edit-date">تاریخ مطالعه</Label>
              <HelpDot label="تاریخ مطالعه" content={FIELD_HELP.studyDate} />
            </div>
            <JalaliDatePicker
              value={form.studyDate}
              onChange={(iso) => setForm((s) => ({ ...s, studyDate: iso }))}
              id="edit-date"
              aria-label="تاریخ مطالعه"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="edit-desc">شرح (اختیاری)</Label>
            <Textarea
              id="edit-desc"
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              className="min-h-16"
              placeholder="هدف مطالعه، دامنه یا نکات مهم…"
            />
          </div>
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          <SaveIndicator status={status} onRetry={retry} />
          <Button variant="outline" onClick={() => void handleClose()}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════
// دیالوگ کپی پروژه با انتخاب بخش‌ها — FR-01
// پیش‌فرض فقط «ساختار و تنظیمات»؛ مشاهدات خام صرفاً با انتخاب صریح
// ═══════════════════════════════════════════════════════════
function DuplicateProjectDialog({
  project,
  onClose,
  onDone,
}: {
  project: { id: string; name: string }
  onClose: () => void
  onDone: (newProjectId: string, newName: string) => void
}) {
  const [newName, setNewName] = useState(`${project.name} (کپی)`)
  const [sections, setSections] = useState<DuplicateSections>({
    structureAndSettings: true,
    operators: false,
    groupsAndAllowances: false,
    ratingTables: false,
    rawObservations: false,
  })
  const [saving, setSaving] = useState(false)

  const rows: { key: keyof DuplicateSections; label: string; desc: string }[] = [
    {
      key: 'structureAndSettings',
      label: 'ساختار و تنظیمات',
      desc: 'ایستگاه‌ها، فعالیت‌ها، عناصر کاری و تنظیمات محاسبات',
    },
    { key: 'operators', label: 'اپراتورها', desc: 'فهرست اپراتورهای این مطالعه' },
    {
      key: 'groupsAndAllowances',
      label: 'گروه‌ها و دسته‌های مجاز',
      desc: 'گروه‌های فعالیت، دسته‌های مجاز و مقادیر گروهی',
    },
    { key: 'ratingTables', label: 'جدول‌های وستینگهاوس', desc: 'جدول‌های مرجع ارزیابی و نمرات آنها' },
    { key: 'rawObservations', label: 'مشاهدات خام', desc: 'داده‌های خام زمان‌سنجی ثبت‌شده' },
  ]

  const submit = async () => {
    if (!newName.trim()) {
      toast.error('نام پروژه جدید الزامی است')
      return
    }
    setSaving(true)
    try {
      const res = await projectsApi.duplicate(project.id, {
        newProjectName: newName.trim(),
        include: {
          structure: sections.structureAndSettings,
          settings: sections.structureAndSettings,
          operators: sections.operators,
          groupsAndAllowances: sections.groupsAndAllowances,
          ratingTables: sections.ratingTables,
          rawObservations: sections.rawObservations,
        },
      })
      onDone(res.projectId, newName.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'کپی پروژه ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>کپی پروژه</DialogTitle>
          <DialogDescription>
            از «{project.name}» یک پروژه جدید با بخش‌های انتخابی شما ساخته می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dup-name">نام پروژه جدید</Label>
            <Input
              id="dup-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="مثلاً: مطالعه خط مونتاژ پمپ (کپی)"
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-bold">بخش‌های قابل کپی</legend>
            {rows.map((row) => (
              <label
                key={row.key}
                htmlFor={`dup-${row.key}`}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors hover:bg-muted/50',
                  sections[row.key] && 'border-brand bg-brand-soft/40'
                )}
              >
                <Checkbox
                  id={`dup-${row.key}`}
                  checked={sections[row.key]}
                  onCheckedChange={(checked) =>
                    setSections((s) => ({ ...s, [row.key]: checked === true }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-bold">{row.label}</span>
                  <span className="block text-xs text-muted-foreground">{row.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="rounded-xl bg-amber-soft p-3 text-xs leading-6 text-muted-foreground">
            <b className="text-amber">توجه: </b>
            کپی عادی مشاهدات، نتایج محاسبه‌شده و تاریخچه مبدأ را منتقل نمی‌کند مگر صریحاً انتخاب شوند.
          </p>
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={saving} className="btn-brand gap-1.5 border-0">
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {saving ? 'در حال کپی…' : 'ساخت کپی'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
