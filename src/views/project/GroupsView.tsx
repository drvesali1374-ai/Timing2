'use client'

// ═══════════════════════════════════════════════════════════
// نمای گروه‌های فعالیت و دسته‌های مجاز — FR-04 / FR-15
// • زبانه گروه‌ها: کارت‌های افقی قابل انتخاب + پنل جزئیات با
//   ذخیره خودکار نام/توضیح (expectedUpdatedAt) و مقادیر مجاز
//   با debounce ۶۰۰ میلی‌ثانیه — کل values ارسال می‌شود
// • زبانه دسته‌ها: جدول دسکتاپ / کارت موبایل + Switch فعال
// • درصدها: کاربر عدد درصد می‌بیند (۱۵)؛ API مقدار اعشاری
//   می‌گیرد (0.15) — PercentInput + formatPercent — FR-15
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Layers, Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HelpDot } from '@/components/common/HelpDot'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { PercentInput, PersianNumberInput } from '@/components/common/PersianNumberInput'
import { useAutosave } from '@/hooks/use-autosave'
import {
  allowancesApi,
  projectsApi,
  type CategoryDto,
  type GroupAllowancesDto,
  type GroupDto,
} from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { ALLOWANCE_METHOD_FORMULAS, ALLOWANCE_METHOD_LABELS, type AllowanceMethod } from '@/domain/types'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDateTime, formatInt, formatPercent } from '@/lib/format'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

type Prefs = ReturnType<typeof useDisplayPrefs>

/** سقف مقدار اعشاری درصد طبق اعتبارسنجی API (۰٫۹۹۹۹ = ۹۹٫۹۹٪) — FR-15 */
const MAX_PERCENT_DECIMAL = 0.9999

interface GroupEditorState {
  name: string
  description: string
}

interface CategoryEditorState {
  name: string
  code: string
  sortOrder: number | null
}

const EMPTY_GROUP_EDITOR: GroupEditorState = { name: '', description: '' }
const EMPTY_CATEGORY_EDITOR: CategoryEditorState = { name: '', code: '', sortOrder: 0 }

/** مقایسه مستقل از ترتیب کلیدها برای ذخیره خودکار مقادیر مجاز */
function percentValuesEqual(a: Record<string, number | null>, b: Record<string, number | null>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => a[k] === b[k])
}

export default function GroupsView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const isMobile = useIsMobile()
  const qc = useQueryClient()

  const [tab, setTab] = useState<'groups' | 'categories'>('groups')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  // ── داده‌ها ──
  const groupsQ = useQuery({
    queryKey: qk.groups(projectId),
    queryFn: () => allowancesApi.groups(projectId),
  })
  const categoriesQ = useQuery({
    queryKey: qk.categories(projectId),
    queryFn: () => allowancesApi.categories(projectId),
  })
  const calcQ = useQuery({
    queryKey: qk.projectCalcSettings(projectId),
    queryFn: () => projectsApi.calcSettings(projectId),
  })

  const groups = groupsQ.data?.items ?? []
  const categories = categoriesQ.data?.items ?? []

  // انتخاب پیش‌فرض: نخستین گروه؛ اگر گروه انتخابی حذف شد، اصلاح می‌شود
  useEffect(() => {
    if (groups.length === 0) {
      if (selectedGroupId !== null) setSelectedGroupId(null)
      return
    }
    if (!groups.some((g) => g.id === selectedGroupId)) setSelectedGroupId(groups[0].id)
  }, [groups, selectedGroupId])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.groups(projectId) })
    void qc.invalidateQueries({ queryKey: qk.categories(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
  }

  // ── ایجاد گروه ──
  const [groupCreateOpen, setGroupCreateOpen] = useState(false)
  const [groupDraft, setGroupDraft] = useState<GroupEditorState>(EMPTY_GROUP_EDITOR)
  const [creatingGroup, setCreatingGroup] = useState(false)

  const submitCreateGroup = async () => {
    if (!groupDraft.name.trim()) {
      toast.error('نام گروه الزامی است')
      return
    }
    setCreatingGroup(true)
    try {
      const res = await allowancesApi.createGroup(projectId, {
        name: groupDraft.name.trim(),
        description: groupDraft.description.trim() || null,
      })
      invalidate()
      setSelectedGroupId(res.group.id)
      setGroupCreateOpen(false)
      setGroupDraft(EMPTY_GROUP_EDITOR)
      toast.success('گروه فعالیت ایجاد شد')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ایجاد گروه ناموفق بود')
    } finally {
      setCreatingGroup(false)
    }
  }

  // ── حذف گروه — FR-26 ──
  const [deletingGroup, setDeletingGroup] = useState<GroupDto | null>(null)
  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => allowancesApi.deleteGroup(id),
    onSuccess: (res) => {
      invalidate()
      setDeletingGroup(null)
      toast.success(
        `گروه حذف شد — ${formatInt(res.removedCounts.values, prefs)} مقدار مجاز پاک شد و ${formatInt(
          res.removedCounts.activities,
          prefs
        )} فعالیتِ این گروه بدون گروه شد (داده آن‌ها حذف نشد)`
      )
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف گروه ناموفق بود'),
  })

  // ── ایجاد دسته ──
  const [catCreateOpen, setCatCreateOpen] = useState(false)
  const [catDraft, setCatDraft] = useState<{ name: string; code: string; isActive: boolean }>({
    name: '',
    code: '',
    isActive: true,
  })
  const [creatingCat, setCreatingCat] = useState(false)

  const submitCreateCategory = async () => {
    if (!catDraft.name.trim()) {
      toast.error('نام دسته الزامی است')
      return
    }
    setCreatingCat(true)
    try {
      await allowancesApi.createCategory(projectId, {
        name: catDraft.name.trim(),
        code: catDraft.code.trim() || null,
        isActive: catDraft.isActive,
      })
      invalidate()
      setCatCreateOpen(false)
      setCatDraft({ name: '', code: '', isActive: true })
      toast.success('دسته مجاز ایجاد شد')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ایجاد دسته ناموفق بود')
    } finally {
      setCreatingCat(false)
    }
  }

  // ── ویرایش دسته با ذخیره خودکار — FR-23 ──
  const [catEditOpen, setCatEditOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<CategoryDto | null>(null)
  const [catEditor, setCatEditor] = useState<CategoryEditorState>(EMPTY_CATEGORY_EDITOR)

  const { status: catAutoStatus, retry: catAutoRetry } = useAutosave<CategoryEditorState>({
    data: catEditor,
    ready: catEditOpen && editingCat !== null,
    save: async (value) => {
      if (!value.name.trim()) return // نام خالی معتبر نیست؛ تا تکمیل نام ذخیره نمی‌شود
      await allowancesApi.updateCategory(editingCat!.id, {
        name: value.name.trim(),
        code: value.code.trim() || null,
        sortOrder: value.sortOrder ?? 0,
      })
      invalidate()
    },
  })

  const openCatEdit = (cat: CategoryDto) => {
    setEditingCat(cat)
    setCatEditor({ name: cat.name, code: cat.code ?? '', sortOrder: cat.sortOrder })
    setCatEditOpen(true)
  }

  // ── فعال/غیرفعال‌سازی دسته (ذخیره خودکار در لحظه با به‌روزرسانی خوش‌بینانه) ──
  const [togglingCatId, setTogglingCatId] = useState<string | null>(null)
  const toggleCategory = async (cat: CategoryDto, next: boolean) => {
    setTogglingCatId(cat.id)
    qc.setQueryData<{ items: CategoryDto[] }>(qk.categories(projectId), (old) =>
      old ? { ...old, items: old.items.map((c) => (c.id === cat.id ? { ...c, isActive: next } : c)) } : old
    )
    try {
      await allowancesApi.updateCategory(cat.id, { isActive: next })
      invalidate()
      toast.success(
        next
          ? `دسته «${cat.name}» فعال شد`
          : `دسته «${cat.name}» غیرفعال شد — از مجموع A کنار گذاشته می‌شود`
      )
    } catch (err) {
      void qc.invalidateQueries({ queryKey: qk.categories(projectId) })
      toast.error(err instanceof Error ? err.message : 'تغییر وضعیت دسته ناموفق بود')
    } finally {
      setTogglingCatId(null)
    }
  }

  // ── حذف دسته — FR-26 ──
  const [deletingCat, setDeletingCat] = useState<CategoryDto | null>(null)
  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => allowancesApi.deleteCategory(id),
    onSuccess: (res) => {
      invalidate()
      setDeletingCat(null)
      toast.success(
        `دسته حذف شد — ${formatInt(res.removedCounts.groupValues, prefs)} مقدار گروه و ${formatInt(
          res.removedCounts.overrides,
          prefs
        )} بازنویسی فعالیت پاک شد`
      )
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف دسته ناموفق بود'),
  })

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

  const method = calcQ.data?.allowanceMethod
  const methodLabel = method ? ALLOWANCE_METHOD_LABELS[method as AllowanceMethod] : undefined
  const methodFormula = method ? ALLOWANCE_METHOD_FORMULAS[method as AllowanceMethod] : undefined

  return (
    <div className="animate-view-in mx-auto max-w-5xl space-y-5">
      {/* سربرگ بخش */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <Layers className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">گروه‌ها و مجازها</h1>
            <p className="num text-xs text-muted-foreground">
              {formatInt(groups.length, prefs)} گروه · {formatInt(categories.length, prefs)} دسته مجاز
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'groups' | 'categories')} dir="rtl">
        <TabsList>
          <TabsTrigger value="groups">گروه‌های فعالیت</TabsTrigger>
          <TabsTrigger value="categories">دسته‌های مجاز</TabsTrigger>
        </TabsList>

        {/* ═══════════ زبانه گروه‌ها — FR-04 ═══════════ */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-1 text-sm font-bold">
              گروه‌های فعالیت
              <HelpDot
                label="گروه فعالیت"
                content={{
                  what: 'گروه فعالیت، بسته‌ای از مقادیر مجاز است که هر فعالیت می‌تواند به آن تخصیص یابد و مقادیر را از آن به ارث ببرد؛ در سطح فعالیت هر دسته قابل بازنویسی است.',
                  input: 'گروه بسازید، دسته‌های مجاز را درصدگذاری کنید و فعالیت‌ها را از مرحله «ساختار تولید» به گروه تخصیص دهید.',
                  example: 'گروه «کار دستی» یا «کار ماشینی» — یا گروه‌های اختصاصی شرکت شما.',
                  note: 'مجموع A فقط از دسته‌های فعال ساخته می‌شود؛ منبع هر مقدار (ارث‌رسیده از گروه یا اختصاصی فعالیت) در صفحه فعالیت مشخص می‌شود.',
                }}
              />
            </h2>
            <Button onClick={() => setGroupCreateOpen(true)} className="btn-brand gap-1.5 border-0">
              <Plus className="size-4" aria-hidden />
              گروه جدید
            </Button>
          </div>

          {groupsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : groupsQ.error ? (
            <EmptyState
              title="بارگذاری گروه‌ها ناموفق بود"
              description={groupsQ.error instanceof Error ? groupsQ.error.message : 'خطای نامشخص'}
              action={
                <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.groups(projectId) })}>
                  تلاش مجدد
                </Button>
              }
            />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<Layers className="size-7" aria-hidden />}
              title="گروهی تعریف نشده"
              description="گروه‌های دلخواه مانند کار دستی یا کار ماشینی بسازید؛ فعالیت‌ها مجازهای گروه را به ارث می‌برند و امکان بازنویسی دارند."
              action={
                <Button onClick={() => setGroupCreateOpen(true)} className="btn-brand gap-1.5 border-0">
                  <Plus className="size-4" aria-hidden />
                  ثبت اولین گروه
                </Button>
              }
            />
          ) : (
            <>
              {/* کارت‌های افقی قابل انتخاب */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="فهرست گروه‌های فعالیت">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    aria-pressed={selectedGroupId === g.id}
                    aria-label={`انتخاب گروه ${g.name}`}
                    className={cn(
                      'card-premium p-4 text-right transition-all',
                      selectedGroupId === g.id ? 'ring-2 ring-brand' : 'hover:border-brand/40'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{g.name}</p>
                        <p
                          className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground"
                          title={g.description ?? undefined}
                        >
                          {g.description ?? 'بدون توضیح'}
                        </p>
                      </div>
                      <Badge className="num shrink-0 bg-brand-soft text-brand" aria-label={`جمع مجازهای گروه ${g.name}`}>
                        جمع A: {formatPercent(g.totalA, prefs)}
                      </Badge>
                    </div>
                    <p className="num mt-3 text-xs text-faint">
                      {formatInt(g.activities.length, prefs)} فعالیت
                    </p>
                  </button>
                ))}
              </div>

              {/* پنل جزئیات گروه انتخابی — با key گروه رندر می‌شود تا وضعیت فرم با تعویض گروه بازنشانی شود */}
              {selectedGroup && (
                <GroupDetailPanel
                  key={selectedGroup.id}
                  group={selectedGroup}
                  projectId={projectId}
                  prefs={prefs}
                  isMobile={isMobile}
                  onDelete={() => setDeletingGroup(selectedGroup)}
                  onGoToCategories={() => setTab('categories')}
                />
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════ زبانه دسته‌ها — FR-04 ═══════════ */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-1 text-sm font-bold">
              دسته‌های مجاز
              <HelpDot
                label="دسته مجاز"
                content={{
                  what: 'دسته مجاز، جزء تشکیل‌دهنده مجموع A است که در سطح گروه درصدگذاری می‌شود و فعالیت می‌تواند مقدار آن را بازنویسی کند.',
                  input: 'نام و کد اختیاری وارد کنید؛ ترتیب نمایش با فیلد «ترتیب» تنظیم می‌شود.',
                  example: 'دسته‌هایی مانند استراحت شخصی یا نیازهای طبیعی — درصد نمونه صرفاً مثال است و نرخ مصوب شرکت نیست.',
                  note: 'حذف دسته، مقدار آن در گروه‌ها و بازنویسی‌های فعالیت را نیز حذف می‌کند؛ دسته غیرفعال در مجموع A لحاظ نمی‌شود.',
                }}
              />
            </h2>
            <Button onClick={() => setCatCreateOpen(true)} className="btn-brand gap-1.5 border-0">
              <Plus className="size-4" aria-hidden />
              دسته جدید
            </Button>
          </div>

          {categoriesQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : categoriesQ.error ? (
            <EmptyState
              title="بارگذاری دسته‌ها ناموفق بود"
              description={categoriesQ.error instanceof Error ? categoriesQ.error.message : 'خطای نامشخص'}
              action={
                <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.categories(projectId) })}>
                  تلاش مجدد
                </Button>
              }
            />
          ) : categories.length === 0 ? (
            <EmptyState
              icon={<Tags className="size-7" aria-hidden />}
              title="دسته مجازی تعریف نشده"
              description="دسته‌های مجاز اجزای مجموع A هستند؛ مانند استراحت شخصی یا نیازهای طبیعی. برای درصدگذاری گروه‌ها ابتدا باید دسته بسازید."
              action={
                <Button onClick={() => setCatCreateOpen(true)} className="btn-brand gap-1.5 border-0">
                  <Plus className="size-4" aria-hidden />
                  ثبت اولین دسته
                </Button>
              }
            />
          ) : isMobile ? (
            /* کارت موبایل — FR-30 */
            <div className="space-y-3">
              {categories.map((c) => (
                <div key={c.id} className="card-premium p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{c.name}</p>
                      <p className="num text-xs text-faint" dir="ltr">
                        {c.code ?? 'بدون کد'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openCatEdit(c)}
                        aria-label={`ویرایش دسته ${c.name}`}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red hover:text-red"
                        onClick={() => setDeletingCat(c)}
                        aria-label={`حذف دسته ${c.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.isActive}
                        onCheckedChange={(v) => toggleCategory(c, v)}
                        disabled={togglingCatId === c.id}
                        aria-label={`${c.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'} دسته ${c.name}`}
                      />
                      <span className={cn('text-xs font-medium', c.isActive ? 'text-green' : 'text-faint')}>
                        {c.isActive ? 'فعال' : 'غیرفعال'}
                      </span>
                    </div>
                    <p className="num text-xs text-muted-foreground">
                      {formatInt(c.groupValuesCount, prefs)} گروه · {formatInt(c.overrideCount, prefs)} بازنویسی
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-faint">{formatDateTime(c.updatedAt, prefs)}</p>
                </div>
              ))}
            </div>
          ) : (
            /* جدول دسکتاپ */
            <div className="card-premium overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-2/70 text-right text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-bold">دسته مجاز</th>
                    <th className="px-4 py-3 font-bold">وضعیت</th>
                    <th className="num px-4 py-3 font-bold">مقادیر گروه</th>
                    <th className="num px-4 py-3 font-bold">بازنویسی فعالیت</th>
                    <th className="px-4 py-3 font-bold">آخرین تغییر</th>
                    <th className="px-4 py-3" aria-label="عملیات" />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <span className="font-bold">{c.name}</span>
                        {c.code && (
                          <span className="num ms-2 font-mono text-xs text-faint" dir="ltr">
                            {c.code}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={c.isActive}
                            onCheckedChange={(v) => toggleCategory(c, v)}
                            disabled={togglingCatId === c.id}
                            aria-label={`${c.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'} دسته ${c.name}`}
                          />
                          <span className={cn('text-xs font-medium', c.isActive ? 'text-green' : 'text-faint')}>
                            {c.isActive ? 'فعال' : 'غیرفعال'}
                          </span>
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-muted-foreground">{formatInt(c.groupValuesCount, prefs)}</td>
                      <td className="num px-4 py-3 text-muted-foreground">{formatInt(c.overrideCount, prefs)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(c.updatedAt, prefs)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openCatEdit(c)}
                            aria-label={`ویرایش دسته ${c.name}`}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-red hover:text-red"
                            onClick={() => setDeletingCat(c)}
                            aria-label={`حذف دسته ${c.name}`}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* نکته پایین — روش اعمال مجاز — FR-15 */}
          <div className="rounded-xl bg-muted p-3 text-xs leading-6 text-muted-foreground">
            <b className="text-foreground">روش اعمال مجاز: </b>
            روش اعمال مجاز (درصد از زمان نرمال یا سهم از زمان استاندارد) در «مشخصات پروژه» انتخاب می‌شود.
            {calcQ.isLoading ? (
              <span className="text-faint"> (در حال بارگذاری تنظیم فعلی…)</span>
            ) : calcQ.error ? (
              <span className="text-amber"> (بارگذاری تنظیم فعلی ناموفق بود — صفحه را تازه‌سازی کنید)</span>
            ) : methodLabel && methodFormula ? (
              <>
                {' '}
                روش فعلی این پروژه: «{methodLabel}» با فرمول{' '}
                <Badge variant="outline" className="num font-mono" dir="ltr">
                  {methodFormula}
                </Badge>
                {method === 'SHARE_OF_ST'
                  ? ' — در این روش مجموع A باید کمتر از ۱۰۰٪ باشد؛ در غیر این صورت محاسبه ممنوع است.'
                  : ''}
              </>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      {/* دیالوگ ایجاد گروه */}
      <Dialog
        open={groupCreateOpen}
        onOpenChange={(open) => {
          setGroupCreateOpen(open)
          if (!open) setGroupDraft(EMPTY_GROUP_EDITOR)
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>گروه جدید</DialogTitle>
            <DialogDescription>
              گروه‌ها بسته‌های قابل استفاده مجدد مقادیر مجاز هستند؛ فعالیت‌ها مقادیر را از گروه به ارث می‌برند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="grp-name">نام گروه (الزامی)</Label>
                <HelpDot
                  label="نام گروه"
                  content={{
                    what: 'نامی گویا برای بسته مجازهای فعالیت؛ فعالیت‌ها در ساختار تولید به این گروه تخصیص می‌یابند.',
                    input: 'نام کوتاه و معنادار.',
                    example: '«کار دستی»، «کار ماشینی» یا گروه اختصاصی شرکت.',
                  }}
                />
              </div>
              <Input
                id="grp-name"
                value={groupDraft.name}
                onChange={(e) => setGroupDraft((s) => ({ ...s, name: e.target.value }))}
                placeholder="مثلاً: کار دستی"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grp-desc">توضیحات (اختیاری)</Label>
              <Textarea
                id="grp-desc"
                value={groupDraft.description}
                onChange={(e) => setGroupDraft((s) => ({ ...s, description: e.target.value }))}
                placeholder="مثلاً: مجازهای رایج کارهای بدون ماشین"
                className="min-h-16"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setGroupCreateOpen(false)
                setGroupDraft(EMPTY_GROUP_EDITOR)
              }}
            >
              انصراف
            </Button>
            <Button onClick={submitCreateGroup} disabled={creatingGroup} className="btn-brand border-0">
              {creatingGroup ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              ثبت گروه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ایجاد دسته */}
      <Dialog
        open={catCreateOpen}
        onOpenChange={(open) => {
          setCatCreateOpen(open)
          if (!open) setCatDraft({ name: '', code: '', isActive: true })
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>دسته مجاز جدید</DialogTitle>
            <DialogDescription>
              دسته‌ها اجزای مجموع A هستند و در سطح گروه درصدگذاری می‌شوند؛ فعالیت می‌تواند مقدار هر دسته را بازنویسی کند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="cat-name">نام دسته (الزامی)</Label>
                <HelpDot
                  label="نام دسته مجاز"
                  content={{
                    what: 'نام جزء مجاز که در گروه‌ها و گزارش‌ها نمایش داده می‌شود.',
                    example: 'استراحت شخصی، نیازهای طبیعی، مزاحمت کاری — درصد نمونه صرفاً مثال است و نرخ مصوب شرکت نیست.',
                  }}
                />
              </div>
              <Input
                id="cat-name"
                value={catDraft.name}
                onChange={(e) => setCatDraft((s) => ({ ...s, name: e.target.value }))}
                placeholder="مثلاً: استراحت شخصی"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-code">کد (اختیاری)</Label>
              <Input
                id="cat-code"
                value={catDraft.code}
                onChange={(e) => setCatDraft((s) => ({ ...s, code: e.target.value }))}
                placeholder="مثلاً: PF"
                dir="ltr"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface-2/70 p-3">
              <div>
                <Label htmlFor="cat-active" className="text-sm">
                  دسته فعال باشد
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">دسته غیرفعال در مجموع A لحاظ نمی‌شود.</p>
              </div>
              <Switch
                id="cat-active"
                checked={catDraft.isActive}
                onCheckedChange={(v) => setCatDraft((s) => ({ ...s, isActive: v }))}
                aria-label="دسته فعال باشد"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCatCreateOpen(false)
                setCatDraft({ name: '', code: '', isActive: true })
              }}
            >
              انصراف
            </Button>
            <Button onClick={submitCreateCategory} disabled={creatingCat} className="btn-brand border-0">
              {creatingCat ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              ثبت دسته
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ویرایش دسته — ذخیره خودکار */}
      <Dialog
        open={catEditOpen}
        onOpenChange={(open) => {
          setCatEditOpen(open)
          if (!open) setEditingCat(null)
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش دسته مجاز</DialogTitle>
            <DialogDescription>تغییرات به‌صورت خودکار ذخیره می‌شوند.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cate-name">نام دسته</Label>
              <Input
                id="cate-name"
                value={catEditor.name}
                onChange={(e) => setCatEditor((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cate-code">کد (اختیاری)</Label>
              <Input
                id="cate-code"
                value={catEditor.code}
                onChange={(e) => setCatEditor((s) => ({ ...s, code: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="cate-sort">ترتیب نمایش</Label>
                <HelpDot
                  label="ترتیب نمایش"
                  content={{
                    what: 'ترتیب نمایش دسته در جدول‌های گروه و گزارش‌ها؛ عدد کوچک‌تر بالاتر.',
                    input: 'عدد صحیح بین ۰ تا ۹۹۹۹.',
                  }}
                />
              </div>
              <PersianNumberInput
                id="cate-sort"
                value={catEditor.sortOrder}
                onChange={(v) => setCatEditor((s) => ({ ...s, sortOrder: v }))}
                decimals={false}
                min={0}
                max={9999}
                aria-label="ترتیب نمایش دسته"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between gap-2">
            <SaveIndicator status={editingCat ? catAutoStatus : 'idle'} onRetry={catAutoRetry} />
            <Button variant="outline" onClick={() => setCatEditOpen(false)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف گروه — FR-26 */}
      <ConfirmDeleteDialog
        open={deletingGroup !== null}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
        title="حذف گروه فعالیت"
        entityName={deletingGroup?.name ?? ''}
        dependencies={{
          'مقدار مجاز ثبت‌شده در این گروه (حذف می‌شود)': deletingGroup?.groupAllowances.length ?? 0,
          'فعالیت — فقط بدون گروه می‌شوند؛ داده آن‌ها حذف نمی‌شود': deletingGroup?.activities.length ?? 0,
        }}
        onConfirm={() => deletingGroup && deleteGroupMutation.mutate(deletingGroup.id)}
        loading={deleteGroupMutation.isPending}
      />

      {/* تأیید حذف دسته — FR-26 */}
      <ConfirmDeleteDialog
        open={deletingCat !== null}
        onOpenChange={(open) => !open && setDeletingCat(null)}
        title="حذف دسته مجاز"
        entityName={deletingCat?.name ?? ''}
        dependencies={{
          'مقدار ثبت‌شده در گروه‌ها': deletingCat?.groupValuesCount ?? 0,
          'بازنویسی اختصاصی فعالیت‌ها': deletingCat?.overrideCount ?? 0,
        }}
        onConfirm={() => deletingCat && deleteCatMutation.mutate(deletingCat.id)}
        loading={deleteCatMutation.isPending}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// پنل جزئیات گروه انتخاب‌شده — ویرایش autosave نام/توضیح
// (با کنترل هم‌زمانی expectedUpdatedAt) + مجازها + فعالیت‌ها
// ═══════════════════════════════════════════════════════════
function GroupDetailPanel({
  group,
  projectId,
  prefs,
  isMobile,
  onDelete,
  onGoToCategories,
}: {
  group: GroupDto
  projectId: string
  prefs: Prefs
  isMobile: boolean
  onDelete: () => void
  onGoToCategories: () => void
}) {
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)

  // ── ویرایش نام/توضیح با ذخیره خودکار — FR-23 ──
  const updatedAtRef = useRef(group.updatedAt)
  const [editor, setEditor] = useState<GroupEditorState>({ name: group.name, description: group.description ?? '' })
  const { status: metaStatus, retry: metaRetry } = useAutosave<GroupEditorState>({
    data: editor,
    ready: true,
    save: async (value) => {
      if (!value.name.trim()) return // نام خالی معتبر نیست؛ تا تکمیل نام ذخیره نمی‌شود
      const res = await allowancesApi.updateGroup(group.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.group.updatedAt
      void qc.invalidateQueries({ queryKey: qk.groups(projectId) })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    },
  })

  // ── مقادیر مجاز گروه — FR-04 ──
  const gaQ = useQuery({
    queryKey: qk.groupAllowances(group.id),
    queryFn: () => allowancesApi.groupAllowances(group.id),
  })

  return (
    <div className="space-y-4">
      {/* فرم نام/توضیح */}
      <div className="card-premium p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Layers className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="font-extrabold">جزئیات گروه «{group.name}»</h3>
              <p className="text-xs text-muted-foreground">تغییرات نام و توضیح به‌صورت خودکار ذخیره می‌شود</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator status={metaStatus} onRetry={metaRetry} />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-red hover:text-red"
              onClick={onDelete}
              aria-label={`حذف گروه ${group.name}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`grp-edit-name-${group.id}`}>نام گروه</Label>
            <Input
              id={`grp-edit-name-${group.id}`}
              value={editor.name}
              onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
              aria-label="نام گروه"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`grp-edit-desc-${group.id}`}>توضیحات</Label>
            <Textarea
              id={`grp-edit-desc-${group.id}`}
              value={editor.description}
              onChange={(e) => setEditor((s) => ({ ...s, description: e.target.value }))}
              className="min-h-16"
              aria-label="توضیحات گروه"
            />
          </div>
        </div>
      </div>

      {/* مجازهای گروه */}
      {gaQ.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : gaQ.error ? (
        <EmptyState
          className="py-6"
          title="بارگذاری مجازهای گروه ناموفق بود"
          description={gaQ.error instanceof Error ? gaQ.error.message : 'خطای نامشخص'}
          action={
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.groupAllowances(group.id) })}>
              تلاش مجدد
            </Button>
          }
        />
      ) : (gaQ.data?.values.length ?? 0) === 0 ? (
        <div className="card-premium p-4">
          <p className="text-sm leading-6 text-muted-foreground">
            هنوز دسته مجازی برای این پروژه تعریف نشده است؛ ابتدا از زبانه «دسته‌های مجاز» دسته بسازید تا بتوانید برای این
            گروه مقدار تعیین کنید.
          </p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onGoToCategories}>
            <Tags className="size-3.5" aria-hidden />
            رفتن به دسته‌های مجاز
          </Button>
        </div>
      ) : gaQ.data ? (
        <AllowancesEditor
          key={group.id}
          groupId={group.id}
          groupName={group.name}
          allowances={gaQ.data}
          projectId={projectId}
          prefs={prefs}
          isMobile={isMobile}
        />
      ) : null}

      {/* فعالیت‌های این گروه */}
      <div className="card-premium overflow-hidden">
        <div className="border-b bg-surface-2/70 px-4 py-3">
          <h3 className="text-sm font-bold">فعالیت‌های این گروه</h3>
        </div>
        {group.activities.length === 0 ? (
          <p className="p-4 text-sm leading-6 text-muted-foreground">
            فعالیتی به این گروه تخصیص داده نشده است؛ تخصیص گروه از مرحله «ساختار تولید» و در جزئیات فعالیت انجام می‌شود.
          </p>
        ) : (
          <ul className="divide-y">
            {group.activities.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="truncate text-xs text-faint">{a.station.name}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => navigate({ name: 'activity', projectId, activityId: a.id })}
                  aria-label={`مشاهده فعالیت ${a.name}`}
                >
                  <Eye className="size-3.5" aria-hidden />
                  مشاهده
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// ویرایشگر مقادیر مجاز گروه — debounce ۶۰۰ms با useAutosave
// کل values (همه دسته‌ها) در هر ذخیره ارسال می‌شود — FR-04
// ═══════════════════════════════════════════════════════════
function AllowancesEditor({
  groupId,
  groupName,
  allowances,
  projectId,
  prefs,
  isMobile,
}: {
  groupId: string
  groupName: string
  allowances: GroupAllowancesDto
  projectId: string
  prefs: Prefs
  isMobile: boolean
}) {
  const qc = useQueryClient()

  // درصد کاربر ↔ مقدار اعشاری API — FR-15
  // ویرایش‌های محلی کاربر روی داده سرور سوار می‌شوند (بدون effect)
  const [edits, setEdits] = useState<Record<string, number | null>>({})
  const values: Record<string, number | null> = useMemo(() => {
    const base: Record<string, number | null> = {}
    for (const v of allowances.values) base[v.categoryId] = v.percentValue
    return { ...base, ...edits }
  }, [allowances, edits])

  const { status, retry } = useAutosave<Record<string, number | null>>({
    data: values,
    ready: true,
    delayMs: 600,
    isEqual: percentValuesEqual,
    save: async (v) => {
      const entries = Object.entries(v).map(([categoryId, percentValue]) => ({ categoryId, percentValue }))
      if (entries.length === 0) return
      const res = await allowancesApi.putGroupAllowances(groupId, entries)
      qc.setQueryData(qk.groupAllowances(groupId), res)
      void qc.invalidateQueries({ queryKey: qk.groups(projectId) })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    },
  })

  const setPercent = (categoryId: string, v: number | null) => {
    // سقف ۹۹٫۹۹٪ طبق اعتبارسنجی API — مقدار ۱۰۰٪ مجاز نیست
    setEdits((s) => ({ ...s, [categoryId]: v === null ? null : Math.min(v, MAX_PERCENT_DECIMAL) }))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1 text-sm font-bold">
          مجازهای گروه «{groupName}»
          <HelpDot
            label="مجازهای گروه"
            content={{
              what: 'مقدار درصدی هر دسته مجاز برای این گروه؛ فعالیت‌های این گروه این مقادیر را به ارث می‌برند و می‌توانند هر دسته را بازنویسی کنند.',
              input: 'عدد درصد وارد کنید (۰ تا ۹۹٫۹۹)؛ خالی بگذارید تا آن دسته مقداری نداشته باشد.',
              example: 'استراحت شخصی ۵٪ + نیازهای طبیعی ۳٪ ⇒ A=۸٪ — صرفاً مثال؛ نرخ مصوب شرکت شما جایگزین شود',
              note: 'فقط دسته‌های فعال در مجموع A لحاظ می‌شوند؛ درصدها به‌صورت مقدار اعشاری (۰٫۱۵ برای ۱۵٪) ذخیره می‌شوند.',
            }}
          />
        </h3>
        <SaveIndicator status={status} onRetry={retry} />
      </div>

      {isMobile ? (
        /* کارت موبایل — FR-30 */
        <div className="space-y-3">
          {allowances.values.map((cat) => (
            <div key={cat.categoryId} className={cn('card-premium p-4', !cat.isActive && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{cat.name}</p>
                  {cat.code && (
                    <p className="num font-mono text-xs text-faint" dir="ltr">
                      {cat.code}
                    </p>
                  )}
                </div>
                {cat.isActive ? (
                  <Badge className="bg-green-soft text-green">فعال</Badge>
                ) : (
                  <Badge variant="outline" className="text-faint">
                    غیرفعال
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex max-w-40 items-center gap-2">
                <PercentInput
                  value={values[cat.categoryId] ?? null}
                  onChange={(v) => setPercent(cat.categoryId, v)}
                  aria-label={`درصد مجاز دسته ${cat.name}`}
                />
              </div>
            </div>
          ))}
          <div className="card-premium flex items-center justify-between p-4">
            <span className="text-sm font-bold">جمع A (دسته‌های فعال)</span>
            <span className="num font-bold text-brand">{formatPercent(allowances.totalA, prefs)}</span>
          </div>
        </div>
      ) : (
        /* جدول دسکتاپ */
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-surface-2/70 text-right text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-bold">دسته مجاز</th>
                <th className="px-4 py-2.5 font-bold">وضعیت</th>
                <th className="px-4 py-2.5 font-bold">مقدار (درصد)</th>
              </tr>
            </thead>
            <tbody>
              {allowances.values.map((cat) => (
                <tr key={cat.categoryId} className={cn('border-b last:border-0', !cat.isActive && 'opacity-60')}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{cat.name}</span>
                    {cat.code && (
                      <span className="num ms-2 font-mono text-xs text-faint" dir="ltr">
                        {cat.code}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {cat.isActive ? (
                      <Badge className="bg-green-soft text-green">فعال</Badge>
                    ) : (
                      <Badge variant="outline" className="text-faint">
                        غیرفعال
                      </Badge>
                    )}
                  </td>
                  <td className="w-44 px-4 py-2">
                    <PercentInput
                      value={values[cat.categoryId] ?? null}
                      onChange={(v) => setPercent(cat.categoryId, v)}
                      aria-label={`درصد مجاز دسته ${cat.name}`}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 bg-surface-2/70 font-bold">
                <td colSpan={2} className="px-4 py-2.5">
                  جمع A (دسته‌های فعال)
                </td>
                <td className="num px-4 py-2.5 text-brand">{formatPercent(allowances.totalA, prefs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs leading-6 text-muted-foreground">
        فعالیت‌های این گروه مقادیر بالا را به ارث می‌برند؛ بازنویسی هر دسته در صفحه همان فعالیت انجام می‌شود و منبع هر مقدار
        (ارث از گروه یا اختصاصی فعالیت) آنجا مشخص می‌گردد.
      </p>
    </div>
  )
}
