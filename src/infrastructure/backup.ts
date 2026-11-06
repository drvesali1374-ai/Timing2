// ═══════════════════════════════════════════════════════════
// زیرساخت — پشتیبان‌گیری و بازیابی — FR-24 / ۶.۷
// قالب: JSON با manifest (نسخه ساختار + checksum)
// • پشتیبان‌گیری خودکار با زمان‌بندی قابل تنظیم + چرخش نسخه‌ها
// • پشتیبان دستی (ذخیره در پوشه سرور + دانلود)
// • پیش از بازیابی، پشتیبان حفاظتی خودکار گرفته می‌شود
// • پس از بازیابی: checksum + نسخه ساختار بررسی و
//   DeletionMarkerها اعمال می‌شوند (FR-26 / ۱۰.۵)
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { mkdir, readFile, writeFile, readdir, unlink, stat } from 'fs/promises'
import path from 'path'
import {
  DOMAIN_TABLES_INSERT_ORDER,
  SCHEMA_VERSION,
  checksumOf,
  clearDomain,
  dumpDomain,
  enforceReferentialIntegrity,
  loadDomain,
  type DomainTable,
} from './serialize'
import { applyDeletionMarkers } from './deletion'
import { recordAudit } from './audit'
import { AppError } from '@/domain/types'

const BACKUP_DIR = path.join(process.cwd(), 'app-data', 'backups')

export interface BackupManifest {
  format: 'timing-backup'
  schemaVersion: number
  createdAt: string
  checksum: string
}

export interface BackupFile {
  format: 'timing-backup'
  schemaVersion: number
  createdAt: string
  checksum: string
  data: Record<string, Record<string, unknown>[]>
}

async function ensureBackupDir(): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true })
  return BACKUP_DIR
}

/** ایجاد پشتیبان و ثبت شناسنامه آن */
export async function createBackup(kind: 'AUTO' | 'MANUAL' | 'PRE_RESTORE'): Promise<{
  id: string
  fileName: string
  sizeBytes: number
  checksum: string
  projectCount: number
  createdAt: string
}> {
  const dir = await ensureBackupDir()
  const data = await dumpDomain([...DOMAIN_TABLES_INSERT_ORDER])
  // تنظیمات سراسری و تاریخچه نیز بخشی از پشتیبان کامل‌اند (FR-24)
   
  ;(data as any).appSetting = await db.appSetting.findMany()
   
  ;(data as any).auditEvent = await db.auditEvent.findMany()
  const createdAt = new Date().toISOString()
  const checksum = await checksumOf(data)
  const stamp = createdAt.replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `backup-${stamp}-${kind.toLowerCase()}.json`
  const payload: BackupFile = {
    format: 'timing-backup',
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    checksum,
    data,
  }
  const json = JSON.stringify(payload, null, 2)
  await writeFile(path.join(dir, fileName), json, 'utf8')
  const projectCount = data.project?.length ?? 0
  const record = await db.backupRecord.create({
    data: {
      fileName,
      kind,
      sizeBytes: Buffer.byteLength(json, 'utf8'),
      checksum,
      schemaVersion: String(SCHEMA_VERSION),
      projectCount,
    },
  })
  await recordAudit({
    entityType: 'Backup',
    entityId: record.id,
    action: 'BACKUP',
    entityName: fileName,
    after: { kind, sizeBytes: Buffer.byteLength(json, 'utf8'), projectCount },
  })
  await rotateAutoBackups()
  return {
    id: record.id,
    fileName,
    sizeBytes: record.sizeBytes,
    checksum,
    projectCount,
    createdAt: record.createdAt.toISOString(),
  }
}

/** چرخش پشتیبان‌های خودکار بر اساس سیاست نگهداری */
async function rotateAutoBackups(): Promise<void> {
  const setting = await db.appSetting.findUnique({ where: { id: 'backup.retention' } })
  const retention = Number(setting?.value ?? '10')
  const autos = await db.backupRecord.findMany({
    where: { kind: 'AUTO' },
    orderBy: { createdAt: 'desc' },
    skip: retention,
  })
  for (const rec of autos) {
    await safeRemoveFile(path.join(BACKUP_DIR, rec.fileName))
    await db.backupRecord.delete({ where: { id: rec.id } }).catch(() => undefined)
  }
}

async function safeRemoveFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch {
    // نبود فایل نباید عملیات را متوقف کند
  }
}

/** فهرست پشتیبان‌های ثبت‌شده */
export async function listBackups() {
  return db.backupRecord.findMany({ orderBy: { createdAt: 'desc' } })
}

/** بررسی فاصله از آخرین پشتیبان خودکار — برای زمان‌بندی سمت کلاینت */
export async function autoBackupDue(intervalMinutes: number): Promise<boolean> {
  const last = await db.backupRecord.findFirst({
    where: { kind: { in: ['AUTO', 'MANUAL', 'PRE_RESTORE'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (!last) return true
  return Date.now() - last.createdAt.getTime() >= intervalMinutes * 60 * 1000
}

/** اعتبارسنجی محتوای فایل پشتیبان */
export async function validateBackupFile(jsonText: string): Promise<BackupFile> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new AppError('BACKUP_INVALID_JSON', 'فایل پشتیبان JSON معتبر نیست.', 422)
  }
  if (parsed.format !== 'timing-backup') {
    throw new AppError('BACKUP_INVALID_FORMAT', 'این فایل یک بسته پشتیبان معتبر این نرم‌افزار نیست.', 422)
  }
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    throw new AppError(
      'BACKUP_NEWER_SCHEMA',
      `نسخه ساختار داده فایل (${parsed.schemaVersion}) از نسخه فعلی نرم‌افزار (${SCHEMA_VERSION}) جدیدتر است؛ ابتدا نرم‌افزار را به‌روزرسانی کنید.`,
      422
    )
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new AppError('BACKUP_INVALID_DATA', 'بخش داده فایل پشتیبان نامعتبر است.', 422)
  }
  const actual = await checksumOf(parsed.data)
  if (actual !== parsed.checksum) {
    throw new AppError(
      'BACKUP_CHECKSUM_MISMATCH',
      'checksum فایل پشتیبان با محتوای آن مطابقت ندارد؛ فایل احتمالاً آسیب دیده است.',
      422,
      { expected: parsed.checksum, actual }
    )
  }
  return parsed
}

/** بازیابی پشتیبان — با پشتیبان حفاظتی خودکار و اعمال نشانگرهای حذف */
export async function restoreBackup(
  source: { backupId?: string; fileJson?: string }
): Promise<{ restored: Record<string, number>; removedByMarkers: number; protectiveBackupId: string }> {
  let fileJson = source.fileJson
  let fileNameForAudit = 'upload'
  if (source.backupId) {
    const rec = await db.backupRecord.findUnique({ where: { id: source.backupId } })
    if (!rec) throw new AppError('BACKUP_NOT_FOUND', 'نسخه پشتیبان یافت نشد.', 404)
    const filePath = path.join(BACKUP_DIR, rec.fileName)
    try {
      const info = await stat(filePath)
      if (!info.isFile()) throw new Error('not file')
    } catch {
      throw new AppError('BACKUP_FILE_MISSING', `فایل پشتیبان «${rec.fileName}» روی دیسک یافت نشد.`, 422)
    }
    fileJson = await readFile(filePath, 'utf8')
    fileNameForAudit = rec.fileName
  }
  if (!fileJson) throw new AppError('BACKUP_NO_SOURCE', 'منبع بازیابی مشخص نیست.', 400)

  // ۱) اعتبارسنجی پیش از هر تغییری
  const parsed = await validateBackupFile(fileJson)

  // ۲) پشتیبان حفاظتی خودکار — پیش از بازیابی (FR-24)
  const protective = await createBackup('PRE_RESTORE')

  // ۳) نشانگرهای حذف جاری (باید از بازیابی جان سالم به در ببرند)
  const markers = await db.deletionMarker.findMany()

  // ۴) اعمال نشانگرها روی داده بازیابی‌شده + پاکسازی ردیف‌های یتیم
  const snapshot: Record<string, Record<string, unknown>[]> = { ...parsed.data }
  const { removed: removedByMarkers } = applyDeletionMarkers(snapshot, markers)
  const { removed: removedOrphans } = enforceReferentialIntegrity(snapshot)
  const removed = removedByMarkers + removedOrphans
  const auditFromBackup = (parsed.data as Record<string, Record<string, unknown>[]>).auditEvent ?? []
  snapshot.auditEvent = auditFromBackup.filter((e) => typeof e.projectId === 'string')

  // ۵) جایگزینی اتمیک داده‌ها در یک تراکنش
  const restored = await db.$transaction(async (tx) => {
    // رویدادهای audit پروژه‌ای فعلی با بازیابی جایگزین می‌شوند؛ رویدادهای سطح برنامه (BACKUP و ...) می‌مانند
    await tx.auditEvent.deleteMany({ where: { NOT: { projectId: null } } })
    await clearDomain(tx)
    const counts = await loadDomain(tx, snapshot)
    if (snapshot.auditEvent && snapshot.auditEvent.length > 0) {
       
      await (tx as any).auditEvent.createMany({ data: snapshot.auditEvent })
    }
    counts.auditEvent = snapshot.auditEvent?.length ?? 0
    // تنظیمات سراسری از پشتیبان بازیابی می‌شود؛ به‌جز تنظیمات خودِ پشتیبان‌گیری که میزبان‌محورند
     
    const appSettings = ((parsed.data as any).appSetting ?? []) as Record<string, unknown>[]
    for (const s of appSettings) {
      if (typeof s.id === 'string' && String(s.id).startsWith('backup.')) continue
      await tx.appSetting.upsert({ where: { id: String(s.id) }, create: s as never, update: { value: String(s.value) } })
    }
    counts.appSetting = appSettings.length
    return counts
  })

  await recordAudit({
    entityType: 'Backup',
    entityId: source.backupId ?? 'upload',
    action: 'RESTORE',
    entityName: fileNameForAudit,
    after: { removedByMarkers: removed, protectiveBackup: protective.fileName, restored },
  })

  return { restored, removedByMarkers: removed, protectiveBackupId: protective.id }
}

/** حذف یک نسخه پشتیبان (فایل + شناسنامه) */
export async function deleteBackup(backupId: string): Promise<void> {
  const rec = await db.backupRecord.findUnique({ where: { id: backupId } })
  if (!rec) throw new AppError('BACKUP_NOT_FOUND', 'نسخه پشتیبان یافت نشد.', 404)
  await safeRemoveFile(path.join(BACKUP_DIR, rec.fileName))
  await db.backupRecord.delete({ where: { id: backupId } })
}

/** خواندن فایل پشتیبان برای دانلود */
export async function readBackupFile(backupId: string): Promise<{ fileName: string; content: string } | null> {
  const rec = await db.backupRecord.findUnique({ where: { id: backupId } })
  if (!rec) return null
  try {
    const content = await readFile(path.join(BACKUP_DIR, rec.fileName), 'utf8')
    return { fileName: rec.fileName, content }
  } catch {
    return null
  }
}

/** سلامت فایل‌های پشتیبان روی دیسک (تشخیص فایل گمشده) */
export async function backupFilesHealth(): Promise<{ total: number; missing: string[] }> {
  const records = await db.backupRecord.findMany({ select: { fileName: true } })
  let files: string[] = []
  try {
    files = await readdir(BACKUP_DIR)
  } catch {
    files = []
  }
  const fileSet = new Set(files)
  const missing = records.filter((r) => !fileSet.has(r.fileName)).map((r) => r.fileName)
  return { total: records.length, missing }
}

export type { DomainTable }
