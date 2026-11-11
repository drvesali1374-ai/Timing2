'use client'

// ═══════════════════════════════════════════════════════════
// نمای زمان‌سنجی — فاز ۳ — FR-06…FR-12
// انتخاب فعالیت → اپراتور → جلسات (ایجاد با روش اندازه‌گیری)
// → برگهٔ چرخه‌محور (SheetPanel).
// برگهٔ هر اپراتور مستقل است؛ جلسهٔ جدید مستقل از قبلی.
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Factory,
  Loader2,
  Pencil,
  Plus,
  Timer,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { HelpDot } from '@/components/common/HelpDot'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { SheetPanel } from './timing/SheetPanel'
import { TimingSubheader } from './timing/TimingSubheader'
import { structureApi, operatorsApi, timingApi, type SessionListItemDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDateTime, formatInt } from '@/lib/format'
import { TIMING_METHOD_LABELS, type TimingMethod } from '@/domain/types'

export default function TimingView({
  projectId,
  initialActivityId,
}: {
  projectId: string
  /** هنگام ورود از صفحهٔ فعالیت، فعالیت از پیش انتخاب است */
  initialActivityId?: string
}) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()

  const [activityId, setActivityId] = useState<string | null>(initialActivityId ?? null)
  const [showPicker, setShowPicker] = useState(!initialActivityId)
  const [operatorFilter, setOperatorFilter] = useState<string | 'ALL'>('ALL')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<SessionListItemDto | null>(null)
  const [editingSession, setEditingSession] = useState<SessionListItemDto | null>(null)
  const [editNotes, setEditNotes] = useState('')

  // تغییر فعالیت هنگام ورود از تب فعالیت — الگوی تنظیم حالت در رندر
  const [prevInitial, setPrevInitial] = useState(initialActivityId)
  if (initialActivityId !== prevInitial) {
    setPrevInitial(initialActivityId)
    if (initialActivityId) {
      setActivityId(initialActivityId)
      setShowPicker(false)
      setActiveSessionId(null)
    }
  }

  const { data: tree, isLoading: treeLoading } = useQuery({
    queryKey: qk.structure(projectId),
    queryFn: () => structureApi.tree(projectId),
  })

  const { data: operatorsData } = useQuery({
    queryKey: qk.operators(projectId),
    queryFn: () => operatorsApi.list(projectId),
  })

  const { data: sessionsData, isLoading: sessionsLoading, error: sessionsError } = useQuery({
    queryKey: activityId ? qk.sessions(activityId) : ['timing-sessions', 'none'],
    queryFn: () => timingApi.sessions(activityId as string),
    enabled: !!activityId,
  })

  const activities = useMemo(() => {
    if (!tree) return []
    return tree.stations.flatMap((st) =>
      st.activities.map((a) => ({ ...a, stationName: st.name, stationId: st.id }))
    )
  }, [tree])

  const selectedActivity = activities.find((a) => a.id === activityId)
  const operators = operatorsData?.items ?? []
  const sessions = sessionsData?.sessions ?? []
  const filteredSessions = operatorFilter === 'ALL' ? sessions : sessions.filter((s) => s.operatorId === operatorFilter)

  const invalidate = () => {
    if (activityId) void qc.invalidateQueries({ queryKey: qk.sessions(activityId) })
    void qc.invalidateQueries({ queryKey: qk.operators(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
  }

  // ── بازگشت به فهرست فعالیت‌ها از زیرهدر چسبان — §۱۲.۱ ──
  const openPicker = () => {
    setActiveSessionId(null)
    setShowPicker(true)
  }

  const hasElements = (selectedActivity?._count?.workElements ?? 0) > 0

  // ── حذف جلسه — FR-26 ──
  const deleteMutation = useMutation({
    mutationFn: (id: string) => timingApi.deleteSession(id),
    onSuccess: () => {
      invalidate()
      if (activeSessionId && deleting?.id === activeSessionId) setActiveSessionId(null)
      setDeleting(null)
      toast.success('جلسه به‌طور دائمی حذف شد')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف ناموفق بود'),
  })

  // ── ویرایش یادداشت جلسه ──
  const notesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string | null }) =>
      timingApi.updateSession(id, { notes }),
    onSuccess: () => {
      invalidate()
      setEditingSession(null)
      toast.success('یادداشت جلسه ذخیره شد')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ذخیره ناموفق بود'),
  })

  // ═══════════════ برگهٔ فعال ═══════════════
  // زیرهدر چسبان بالای برگه — §۱۲.۱ (اطلاعات فعالیت/ایستگاه/اپراتور فقط همین‌جا)
  if (activeSessionId && activityId && selectedActivity) {
    const activeSession = sessions.find((s) => s.id === activeSessionId)
    return (
      <div className="mx-auto max-w-5xl">
        <TimingSubheader
          variant="sheet"
          prefs={prefs}
          activityName={selectedActivity.name}
          stationName={selectedActivity.stationName}
          onOpenPicker={openPicker}
          canCreateSession={hasElements && operators.length > 0}
          onCreateSession={() => setCreateOpen(true)}
          activeOperatorName={activeSession?.operatorName ?? null}
        />
        <SheetPanel
          sessionId={activeSessionId}
          prefs={prefs}
          onBack={() => setActiveSessionId(null)}
        />
        {/* جلسهٔ جدید از زیرهدر برگه نیز در دسترس است */}
        <CreateSessionDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          activityId={activityId}
          operators={operators}
          onCreated={(sessionId) => {
            invalidate()
            setCreateOpen(false)
            setActiveSessionId(sessionId)
          }}
        />
      </div>
    )
  }

  // ═══════════════ انتخاب فعالیت ═══════════════
  if (treeLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Factory className="size-7" aria-hidden />}
          title="هنوز فعالیتی ثبت نشده است"
          description="زمان‌سنجی برای فعالیت‌ها انجام می‌شود؛ ابتدا در «ساختار تولید» ایستگاه و فعالیت همراه با عناصر کاری ایجاد کنید."
        />
      </div>
    )
  }

  if (!activityId || showPicker) {
    return (
      <div className="animate-view-in mx-auto max-w-4xl space-y-4">
        <Header
          title="زمان‌سنجی"
          subtitle="انتخاب فعالیت برای ثبت برگهٔ چرخه‌محور"
          right={
            activityId ? (
              <Button variant="outline" size="sm" onClick={() => setShowPicker(false)}>
                بازگشت
              </Button>
            ) : undefined
          }
        />
        <div className="space-y-4">
          {tree!.stations.map((st) => (
            <div key={st.id} className="card-premium overflow-hidden">
              <div className="border-b bg-surface-2/50 px-4 py-2.5 text-sm font-bold">
                ایستگاه {st.name}
              </div>
              <div className="divide-y">
                {st.activities.length === 0 && (
                  <p className="px-4 py-3 text-xs text-muted-foreground">فعالیتی ثبت نشده است.</p>
                )}
                {st.activities.map((a) => {
                  const isCurrent = a.id === activityId
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setActivityId(a.id)
                        setShowPicker(false)
                        setOperatorFilter('ALL')
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-muted/50 ${isCurrent ? 'bg-brand-soft/40' : ''}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Timer className="size-4 shrink-0 text-brand" aria-hidden />
                        <span className="truncate text-sm font-bold">{a.name}</span>
                        {(a._count?.workElements ?? 0) === 0 && (
                          <Badge variant="outline" className="shrink-0 border-amber text-[10px] text-amber">
                            بدون عنصر
                          </Badge>
                        )}
                      </span>
                      <span className="num shrink-0 text-[11px] text-muted-foreground">
                        {formatInt(a._count?.workElements ?? 0, prefs)} عنصر
                        {a.targetSampleCount ? ` • هدف ${formatInt(a.targetSampleCount, prefs)} چرخه` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ═══════════════ جلسات فعالیت ═══════════════

  return (
    <div className="mx-auto max-w-5xl">
      {/* زیرهدر چسبان — §۱۲.۱: عنوان فعالیت/ایستگاه، فهرست فعالیت‌ها،
          چیپ‌های فیلتر اپراتور و جلسهٔ جدید؛ کارت‌های جلسه چسبان نیستند */}
      {selectedActivity && (
        <TimingSubheader
          variant="list"
          prefs={prefs}
          activityName={selectedActivity.name}
          stationName={selectedActivity.stationName}
          onOpenPicker={openPicker}
          canCreateSession={hasElements && operators.length > 0}
          onCreateSession={() => setCreateOpen(true)}
          operatorFilter={operatorFilter}
          onOperatorFilter={setOperatorFilter}
          operators={operators}
          sessions={sessions}
        />
      )}

      <div className="animate-view-in space-y-4">
        {/* سربرگ لاغر مرحله — اطلاعات فعالیت/ایستگاه در زیرهدر چسبان است — §۱۲.۱ */}
        <Header
          title="زمان‌سنجی"
          help={
            <HelpDot
              label="مرحلهٔ زمان‌سنجی"
              content={{
                what: 'ثبت چرخه‌های زمان‌سنجی فعالیت منتخب؛ هر ردیف برگه یک چرخهٔ کامل و هر ستون یک عنصر کاری است.',
                input:
                  'فعالیت را از فهرست انتخاب کنید و برای هر اپراتور جلسه‌ای با روش اندازه‌گیری (برگشت به صفر یا پیوسته) بسازید؛ سپس مقادیر را در برگه وارد کنید.',
                example:
                  'برای فعالیت «مونتاژ بدنه» دو جلسه مستقل برای اپراتور ۱ (برگشت به صفر) و اپراتور ۲ (پیوسته) ثبت می‌شود.',
                note: 'مشاهدات مشکوک فقط به‌صورت آماری پرچم‌گذاری می‌شوند؛ حذف خودکار وجود ندارد و تصمیم خروج از محاسبات با شماست.',
              }}
            />
          }
        />

        {/* گاردهای آمادگی */}
        {!hasElements && (
          <EmptyState
            icon={<ClipboardList className="size-7" aria-hidden />}
            title="این فعالیت عنصر کاری ندارد"
            description="برگهٔ زمان‌سنجی ستون‌هایش را از عناصر کاری فعالیت می‌سازد؛ ابتدا عناصر را در ساختار تولید تعریف کنید."
          />
        )}
        {hasElements && operators.length === 0 && (
          <EmptyState
            icon={<UserRound className="size-7" aria-hidden />}
            title="اپراتوری ثبت نشده است"
            description="هر جلسه ترکیبی از فعالیت × اپراتور × روش اندازه‌گیری است؛ ابتدا اپراتورها را ثبت کنید."
          />
        )}

        {/* جلسات */}
        {sessionsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : sessionsError ? (
          <EmptyState
            title="بارگذاری جلسات ناموفق بود"
            description={sessionsError instanceof Error ? sessionsError.message : 'خطای نامشخص'}
          />
        ) : filteredSessions.length === 0 && hasElements && operators.length > 0 ? (
          <EmptyState
            icon={<Timer className="size-7" aria-hidden />}
            title="هنوز جلسه‌ای برای این فعالیت ثبت نشده است"
            description="برای شروع زمان‌سنجی، جلسه‌ای با انتخاب اپراتور و روش اندازه‌گیری (برگشت به صفر یا پیوسته) ایجاد کنید. هر جلسه برگهٔ مستقلی دارد و جلسهٔ جدید مستقل از جلسهٔ قبلی است."
            action={
              <Button onClick={() => setCreateOpen(true)} className="btn-brand gap-1.5 border-0">
                <Plus className="size-4" aria-hidden />
                ایجاد اولین جلسه
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                prefs={prefs}
                onOpen={() => setActiveSessionId(s.id)}
                onDelete={() => setDeleting(s)}
                onEdit={() => {
                  setEditingSession(s)
                  setEditNotes(s.notes ?? '')
                }}
              />
            ))}
          </div>
        )}

        {/* دیالوگ ایجاد جلسه — FR-06 */}
        <CreateSessionDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          activityId={activityId}
          operators={operators}
          onCreated={(sessionId) => {
            invalidate()
            setCreateOpen(false)
            setActiveSessionId(sessionId)
          }}
        />

        {/* ویرایش یادداشت جلسه */}
        <Dialog open={editingSession !== null} onOpenChange={(open) => !open && setEditingSession(null)}>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>یادداشت جلسه</DialogTitle>
              <DialogDescription>
                جلسهٔ {editingSession ? TIMING_METHOD_LABELS[editingSession.timingMethod] : ''} —{' '}
                {editingSession?.operatorName}
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="مثلاً: نوبت صبح، شرایط عادی کارگاه"
              className="min-h-24"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSession(null)}>
                انصراف
              </Button>
              <Button
                className="btn-brand border-0"
                disabled={notesMutation.isPending}
                onClick={() => editingSession && notesMutation.mutate({ id: editingSession.id, notes: editNotes.trim() || null })}
              >
                {notesMutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                ذخیره
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* تأیید حذف دائمی جلسه — FR-26 */}
        <ConfirmDeleteDialog
          open={deleting !== null}
          onOpenChange={(open) => !open && setDeleting(null)}
          title="حذف دائمی جلسهٔ زمان‌سنجی"
          entityName={deleting ? `${deleting.operatorName} — ${TIMING_METHOD_LABELS[deleting.timingMethod]}` : ''}
          dependencies={{
            'چرخه‌های ثبت‌شده': deleting?.cyclesCount ?? 0,
          }}
          onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
          loading={deleteMutation.isPending}
        />
      </div>
    </div>
  )
}

// ═══════════════ اجزای کوچک ═══════════════

function Header({
  title,
  subtitle,
  right,
  help,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  /** راهنمای کنار عنوان — HelpDot */
  help?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="chip-icon bg-brand-soft text-brand">
          <Timer className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="flex items-center gap-1 text-xl font-extrabold">
            {title}
            {help}
          </h1>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function SessionCard({
  session,
  prefs,
  onOpen,
  onDelete,
  onEdit,
}: {
  session: SessionListItemDto
  prefs: ReturnType<typeof useDisplayPrefs>
  onOpen: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  return (
    <div className="card-premium group space-y-2.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-bold text-brand">
            {session.operatorName.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{session.operatorName}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CalendarClock className="size-3" aria-hidden />
              {formatDateTime(session.startedAt, prefs)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button variant="ghost" size="icon" className="size-8" onClick={onEdit} aria-label="ویرایش یادداشت">
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-red hover:text-red" onClick={onDelete} aria-label="حذف جلسه">
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="text-[10px]">
          {TIMING_METHOD_LABELS[session.timingMethod]}
        </Badge>
        {session.status === 'CLOSED' ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            بسته
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-green/40 text-[10px] text-green">
            <CheckCircle2 className="size-3" aria-hidden /> باز
          </Badge>
        )}
        <span className="num text-[11px] text-muted-foreground">
          {formatInt(session.cyclesCount, prefs)} چرخه • {formatInt(session.validCyclesCount, prefs)} معتبر
        </span>
      </div>

      {session.notes && <p className="rounded-lg bg-muted p-2 text-[11px] leading-5 text-muted-foreground">{session.notes}</p>}

      <Button onClick={onOpen} className="btn-brand w-full gap-1.5 border-0">
        <Timer className="size-4" aria-hidden />
        باز کردن برگهٔ زمان‌سنجی
      </Button>
    </div>
  )
}

function CreateSessionDialog({
  open,
  onOpenChange,
  activityId,
  operators,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  activityId: string
  operators: { id: string; displayName: string; code: string | null }[]
  onCreated: (sessionId: string) => void
}) {
  const [operatorId, setOperatorId] = useState('')
  const [method, setMethod] = useState<TimingMethod>('SNAPBACK')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setOperatorId(operators[0]?.id ?? '')
      setMethod('SNAPBACK')
      setNotes('')
    }
  }, [open, operators])

  const submit = async () => {
    if (!operatorId) {
      toast.error('ابتدا اپراتور را انتخاب کنید')
      return
    }
    setSaving(true)
    try {
      const res = await timingApi.createSession(activityId, {
        operatorId,
        timingMethod: method,
        notes: notes.trim() || null,
      })
      onCreated(res.session.id)
      toast.success('جلسه ایجاد شد؛ برگهٔ خالی آمادهٔ ثبت است')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ایجاد جلسه ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>جلسهٔ زمان‌سنجی جدید</DialogTitle>
          <DialogDescription>
            جلسه = فعالیت × اپراتور × روش اندازه‌گیری. روش پس از ایجاد قابل تغییر نیست؛ برای روش دیگر جلسهٔ جدید
            بسازید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>اپراتور</Label>
              <HelpDot
                label="اپراتور جلسه"
                content={{
                  what: 'اپراتوری که برگهٔ زمان‌سنجی این جلسه به او تعلق دارد.',
                  input: 'یکی از اپراتورهای ثبت‌شدهٔ پروژه را انتخاب کنید.',
                  example: '«اپراتور ۱ — آقای رضایی»',
                  note: 'برگهٔ هر اپراتور مستقل است و می‌توانید برای هر اپراتور چند جلسه ثبت کنید.',
                }}
              />
            </div>
            <Select value={operatorId} onValueChange={setOperatorId} dir="rtl">
              <SelectTrigger>
                <SelectValue placeholder="انتخاب اپراتور…" />
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.id}>
                    {op.displayName}
                    {op.code ? ` (${op.code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>روش اندازه‌گیری</Label>
              <HelpDot
                label="روش اندازه‌گیری"
                content={{
                  what: 'نحوهٔ ثبت زمان‌ها در این جلسه؛ پس از ایجاد قابل تغییر نیست.',
                  input:
                    '«برگشت به صفر»: مدت هر عنصر مستقیم ثبت می‌شود. «پیوسته»: قرائت تجمعی کرنومتر در پایان هر عنصر ثبت می‌شود و مدت‌ها از تفاضل قرائت‌ها محاسبه می‌شوند.',
                  example: 'در روش پیوسته، قرائت‌های ۸، ۲۰ و ۴۵ مدت‌های ۸، ۱۲ و ۲۵ ثانیه را می‌دهند.',
                  note: 'مبنای قرائت پیوسته با شروع هر جلسهٔ جدید از صفر آغاز می‌شود؛ کرنومتر داخلی در نسخهٔ اول وجود ندارد و ثبت دستی/از Excel است.',
                }}
              />
            </div>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as TimingMethod)} className="gap-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft/40">
                <RadioGroupItem value="SNAPBACK" className="mt-1" />
                <span className="space-y-1">
                  <span className="block text-sm font-bold">برگشت به صفر (Snapback)</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    زمان سپری‌شدهٔ هر عنصر به‌صورت مستقیم ثبت می‌شود؛ مناسب عناصر کوتاه با توقف کرنومتر.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-soft/40">
                <RadioGroupItem value="CONTINUOUS" className="mt-1" />
                <span className="space-y-1">
                  <span className="block text-sm font-bold">پیوسته (Continuous)</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    قرائت تجمعی در پایان هر عنصر ثبت می‌شود؛ مدت‌ها از تفاضل قرائت‌ها محاسبه می‌شوند و زنجیره در طول
                    جلسه ادامه دارد.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="session-notes">توضیحات (اختیاری)</Label>
            <Textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثلاً: نوبت عصر — شرایط دمای کارگاه بالاتر از حد معمول"
              className="min-h-16"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={saving || !operatorId} className="btn-brand gap-1.5 border-0">
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            ایجاد جلسه و باز کردن برگه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
