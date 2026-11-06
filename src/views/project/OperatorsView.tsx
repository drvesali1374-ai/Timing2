'use client'

// ═══════════════════════════════════════════════════════════
// نمای اپراتورها — FR-05  【نمای مرجع برای الگوهای UI】
// جدول دسکتاپ / کارت موبایل، افزودن/ویرایش با ذخیره خودکار،
// حذف با شمارش وابستگی، راهنمای آیکونی، حالت خالی
// ═══════════════════════════════════════════════════════════
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BadgeCheck, Loader2, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { HelpDot } from '@/components/common/HelpDot'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { useAutosave } from '@/hooks/use-autosave'
import { operatorsApi, type OperatorDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDateTime, formatInt } from '@/lib/format'
import { useIsMobile } from '@/hooks/use-mobile'

interface EditorState {
  displayName: string
  code: string
  notes: string
}

const EMPTY_EDITOR: EditorState = { displayName: '', code: '', notes: '' }

export default function OperatorsView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const isMobile = useIsMobile()
  const qc = useQueryClient()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<OperatorDto | null>(null)
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<OperatorDto | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: qk.operators(projectId),
    queryFn: () => operatorsApi.list(projectId),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.operators(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projects() })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      operatorsApi.create(projectId, {
        displayName: editor.displayName.trim(),
        code: editor.code.trim() || null,
        notes: editor.notes.trim() || null,
      }),
    onSuccess: () => {
      invalidate()
      toast.success('اپراتور ثبت شد')
      setEditorOpen(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت اپراتور ناموفق بود'),
  })

  // ویرایش با ذخیره خودکار — FR-23
  const { status: autoStatus, retry } = useAutosave<EditorState>({
    data: editor,
    ready: editorOpen && editing !== null,
    save: async (value) => {
      await operatorsApi.update(editing!.id, {
        displayName: value.displayName.trim(),
        code: value.code.trim() || null,
        notes: value.notes.trim() || null,
      })
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => operatorsApi.delete(id),
    onSuccess: () => {
      invalidate()
      toast.success('اپراتور به‌طور دائمی حذف شد')
      setDeleting(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف ناموفق بود'),
  })

  const openCreate = () => {
    setEditing(null)
    setEditor(EMPTY_EDITOR)
    setEditorOpen(true)
  }

  const openEdit = (op: OperatorDto) => {
    setEditing(op)
    setEditor({ displayName: op.displayName, code: op.code ?? '', notes: op.notes ?? '' })
    setEditorOpen(true)
  }

  const submitCreate = async () => {
    if (!editor.displayName.trim()) {
      toast.error('نام نمایشی اپراتور الزامی است')
      return
    }
    setSaving(true)
    try {
      await createMutation.mutateAsync()
    } finally {
      setSaving(false)
    }
  }

  const operators = data?.items ?? []

  return (
    <div className="animate-view-in mx-auto max-w-5xl space-y-5">
      {/* سربرگ بخش */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <Users className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">اپراتورها</h1>
            <p className="num text-xs text-muted-foreground">
              {formatInt(operators.length, prefs)} اپراتور در این مطالعه
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={autoStatus} onRetry={retry} />
          <Button onClick={openCreate} className="btn-brand gap-1.5 border-0">
            <Plus className="size-4" aria-hidden />
            اپراتور جدید
          </Button>
        </div>
      </div>

      {/* محتوا */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="بارگذاری اپراتورها ناموفق بود"
          description={error instanceof Error ? error.message : 'خطای نامشخص'}
          action={
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.operators(projectId) })}>
              تلاش مجدد
            </Button>
          }
        />
      ) : operators.length === 0 ? (
        <EmptyState
          icon={<UserRound className="size-7" aria-hidden />}
          title="هنوز اپراتوری ثبت نشده است"
          description="برای زمان‌سنجی (فاز ۳) حداقل به یک اپراتور نیاز دارید. اپراتور در سطح پروژه تعریف می‌شود و می‌تواند در چند فعالیت شرکت کند؛ برگه هر اپراتور مستقل خواهد بود."
          action={
            <Button onClick={openCreate} className="btn-brand gap-1.5 border-0">
              <Plus className="size-4" aria-hidden />
              ثبت اولین اپراتور
            </Button>
          }
        />
      ) : isMobile ? (
        /* کارت موبایل — FR-30 */
        <div className="space-y-3">
          {operators.map((op) => (
            <MobileCard
              key={op.id}
              op={op}
              prefs={prefs}
              onEdit={() => openEdit(op)}
              onDelete={() => setDeleting(op)}
            />
          ))}
        </div>
      ) : (
        /* جدول دسکتاپ */
        <div className="card-premium overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-surface-2/70 text-right text-xs text-muted-foreground">
                <th className="px-4 py-3 font-bold">نام نمایشی</th>
                <th className="px-4 py-3 font-bold">کد</th>
                <th className="px-4 py-3 font-bold">توضیحات</th>
                <th className="num px-4 py-3 font-bold">جلسات</th>
                <th className="px-4 py-3 font-bold">آخرین تغییر</th>
                <th className="px-4 py-3" aria-label="عملیات" />
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id} className="border-b last:border-0 transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                        {op.displayName.slice(0, 2)}
                      </span>
                      <span className="font-bold">{op.displayName}</span>
                    </div>
                  </td>
                  <td className="num px-4 py-3 text-muted-foreground">{op.code ?? '—'}</td>
                  <td className="max-w-48 truncate px-4 py-3 text-muted-foreground" title={op.notes ?? undefined}>
                    {op.notes ?? '—'}
                  </td>
                  <td className="num px-4 py-3 text-muted-foreground">
                    {formatInt(op.sessionsCount, prefs)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTime(op.updatedAt, prefs)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(op)} aria-label={`ویرایش ${op.displayName}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-red hover:text-red" onClick={() => setDeleting(op)} aria-label={`حذف ${op.displayName}`}>
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

      {/* راهنمای بخش */}
      <p className="rounded-xl bg-muted p-3 text-xs leading-6 text-muted-foreground">
        <b className="text-foreground">یادآوری: </b>
        برگه زمان‌سنجی هر اپراتور برای هر فعالیت مستقل است و در فاز ۳ فعال می‌شود. حذف اپراتور به‌طور دائمی
        است و جلسات او را نیز حذف می‌کند.
      </p>

      {/* دیالوگ ایجاد/ویرایش */}
      <Dialog open={editorOpen} onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditing(null) }}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش اپراتور' : 'اپراتور جدید'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'تغییرات به‌صورت خودکار ذخیره می‌شوند.'
                : 'نام نمایشی الزامی است؛ کد داخلی اختیاری است.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="op-name">نام نمایشی</Label>
                <HelpDot
                  label="نام نمایشی اپراتور"
                  content={{
                    what: 'نام یا کدی که این اپراتور در تمام گزارش‌ها و برگه‌های زمان‌سنجی با آن شناخته می‌شود.',
                    input: 'نام کامل یا کد داخلی پرسنل؛ یکتا نبودن الزامی نیست اما نام‌های گمراه‌کننده توصیه نمی‌شود.',
                    example: '«اپراتور ۱ — آقای رضایی» یا فقط «OP-07»',
                    note: 'هویت اپراتور با شناسه پایدار داخلی نگه داشته می‌شود؛ تغییر نام، تاریخچه را خراب نمی‌کند.',
                  }}
                />
              </div>
              <Input
                id="op-name"
                value={editor.displayName}
                onChange={(e) => setEditor((s) => ({ ...s, displayName: e.target.value }))}
                placeholder="مثلاً: اپراتور ۱"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="op-code">کد داخلی (اختیاری)</Label>
                <HelpDot
                  label="کد اپراتور"
                  content={{
                    what: 'کد پرسنلی یا شناسه داخلی شرکت برای این اپراتور.',
                    input: 'هر کد کوتاه؛ مثلاً شماره پرسنلی.',
                    example: 'P-1042',
                  }}
                />
              </div>
              <Input
                id="op-code"
                value={editor.code}
                onChange={(e) => setEditor((s) => ({ ...s, code: e.target.value }))}
                placeholder="مثلاً: P-1042"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="op-notes">توضیحات (اختیاری)</Label>
              <Textarea
                id="op-notes"
                value={editor.notes}
                onChange={(e) => setEditor((s) => ({ ...s, notes: e.target.value }))}
                placeholder="مثلاً: سابقه ۳ سال کار روی این ایستگاه"
                className="min-h-16"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between gap-2">
            <SaveIndicator status={editing ? autoStatus : 'idle'} onRetry={retry} />
            {editing ? (
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                بستن
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditorOpen(false)}>
                  انصراف
                </Button>
                <Button onClick={submitCreate} disabled={saving} className="btn-brand border-0">
                  {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                  ثبت اپراتور
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف دائمی — FR-26 */}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف دائمی اپراتور"
        entityName={deleting?.displayName ?? ''}
        dependencies={{
          'جلسات زمان‌سنجی': deleting?.sessionsCount ?? 0,
        }}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

function MobileCard({
  op,
  prefs,
  onEdit,
  onDelete,
}: {
  op: OperatorDto
  prefs: ReturnType<typeof useDisplayPrefs>
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="card-premium p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-sm font-bold text-brand">
            {op.displayName.slice(0, 2)}
          </span>
          <div>
            <p className="font-bold">{op.displayName}</p>
            <p className="num text-xs text-muted-foreground">{op.code ?? 'بدون کد'}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={onEdit} aria-label="ویرایش">
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-red hover:text-red" onClick={onDelete} aria-label="حذف">
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="num flex items-center gap-1">
          <BadgeCheck className="size-3.5 text-green" aria-hidden />
          {formatInt(op.sessionsCount, prefs)} جلسه
        </span>
        <span>{formatDateTime(op.updatedAt, prefs)}</span>
      </div>
      {op.notes && <p className="mt-2 rounded-lg bg-muted p-2 text-xs leading-6">{op.notes}</p>}
    </div>
  )
}
