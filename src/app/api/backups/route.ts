// پشتیبان‌گیری — فهرست/ایجاد — FR-24
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { createBackup, listBackups, autoBackupDue, backupFilesHealth } from '@/infrastructure/backup'
import { getAppSettings } from '@/application/settings-service'

export function GET(req: NextRequest) {
  return handle(req, async () => {
    const [items, health] = await Promise.all([listBackups(), backupFilesHealth()])
    return ok({ items, health })
  })
}

/** ایجاد پشتیبان دستی یا خودکار (auto=true با رعایت فاصله زمانی تنظیم‌شده) */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const url = new URL(req.url)
    const isAuto = url.searchParams.get('auto') === '1'
    if (isAuto) {
      const settings = await getAppSettings()
      if (settings['backup.autoEnabled'] !== 'true') {
        return ok({ skipped: true, reason: 'AUTO_BACKUP_DISABLED' })
      }
      const interval = Number(settings['backup.intervalMinutes'] ?? '30')
      if (!(await autoBackupDue(interval))) {
        return ok({ skipped: true, reason: 'NOT_DUE_YET' })
      }
      const result = await createBackup('AUTO')
      return ok(result, 201)
    }
    const result = await createBackup('MANUAL')
    return ok(result, 201)
  })
}
