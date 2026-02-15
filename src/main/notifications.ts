import { Notification, app, type NotificationConstructorOptions } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getSetting } from './db/tasks'

const activeNotifications = new Set<Notification>()
const NOTIFICATION_SHOW_TIMEOUT_MS = 2000

export interface NotificationDispatchResult {
  shown: boolean
  reason?: string
}

export function notifyTaskComplete(taskName: string, summary?: string): void {
  if (!shouldNotify()) return
  void showNotification(
    `Task completed: ${taskName}`,
    summary ? truncate(summary, 200) : 'Task finished successfully.'
  )
}

export function notifyTaskFailed(taskName: string, error: string): void {
  if (!shouldNotify()) return
  void showNotification(`Task failed: ${taskName}`, truncate(error, 200))
}

export function testNotification(): Promise<NotificationDispatchResult> {
  return showNotification('Daymon notification test', 'If you can see this, notifications are working.')
}

async function showNotification(title: string, body: string): Promise<NotificationDispatchResult> {
  if (!Notification.isSupported()) {
    console.warn('Notifications are not supported in this environment.')
    return { shown: false, reason: 'Notifications are not supported on this system.' }
  }

  const options: NotificationConstructorOptions = { title, body, silent: false }
  if (process.platform === 'darwin') {
    options.subtitle = app.getName()
  } else {
    const icon = getNotificationIconPath()
    if (icon) {
      options.icon = icon
    }
  }

  let notification: Notification
  try {
    notification = new Notification(options)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('Notification construction failed:', error)
    return { shown: false, reason }
  }

  return await new Promise<NotificationDispatchResult>((resolve) => {
    let settled = false
    let shown = false

    const finish = (result: NotificationDispatchResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      activeNotifications.delete(notification)
      resolve(result)
    }

    const timeout = setTimeout(() => {
      finish({
        shown: false,
        reason: process.platform === 'darwin'
          ? 'Timed out waiting for macOS notification. Check System Settings > Notifications > Daymon.'
          : 'Timed out waiting for notification display.'
      })
    }, NOTIFICATION_SHOW_TIMEOUT_MS)

    activeNotifications.add(notification)

    notification.once('show', () => {
      shown = true
      finish({ shown: true })
    })
    notification.once('failed', (_event, error) => {
      const reason = toErrorMessage(error)
      console.error('Notification failed to display:', error)
      finish({ shown: false, reason })
    })
    notification.once('close', () => {
      if (!shown) {
        finish({ shown: false, reason: 'Notification closed before being shown.' })
      }
    })

    try {
      notification.show()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error('Notification show() threw:', error)
      finish({ shown: false, reason })
    }
  })
}

function shouldNotify(): boolean {
  const setting = getSetting('notifications_enabled')
  return setting !== 'false'
}

function getNotificationIconPath(): string | undefined {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const iconCandidates = [
    join(base, 'resources', 'icon.png'),
    join(base, 'resources', 'logo.png')
  ]
  return iconCandidates.find((path) => existsSync(path))
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
