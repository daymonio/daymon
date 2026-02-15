import { Notification, app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getSetting } from './db/tasks'

const activeNotifications = new Set<Notification>()

export function notifyTaskComplete(taskName: string, summary?: string): boolean {
  if (!shouldNotify()) return false
  return showNotification(
    `Task completed: ${taskName}`,
    summary ? truncate(summary, 200) : 'Task finished successfully.'
  )
}

export function notifyTaskFailed(taskName: string, error: string): boolean {
  if (!shouldNotify()) return false
  return showNotification(`Task failed: ${taskName}`, truncate(error, 200))
}

export function testNotification(): boolean {
  return showNotification('Daymon notification test', 'If you can see this, notifications are working.')
}

function showNotification(title: string, body: string): boolean {
  if (!Notification.isSupported()) {
    console.warn('Notifications are not supported in this environment.')
    return false
  }

  const icon = getNotificationIconPath()
  const notification = new Notification({
    title,
    body,
    icon,
    silent: false,
    urgency: 'normal'
  })

  activeNotifications.add(notification)
  const cleanup = (): void => {
    activeNotifications.delete(notification)
  }
  notification.once('close', cleanup)
  notification.once('failed', (_event, error) => {
    console.error('Notification failed to display:', error)
    cleanup()
  })

  try {
    notification.show()
    return true
  } catch (error) {
    cleanup()
    console.error('Notification show() threw:', error)
    return false
  }
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
