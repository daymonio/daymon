import { Notification } from 'electron'
import { getSetting } from './db/tasks'

export function notifyTaskComplete(taskName: string, summary?: string): void {
  if (!shouldNotify()) return
  const notification = new Notification({
    title: `Task completed: ${taskName}`,
    body: summary ? truncate(summary, 200) : 'Task finished successfully.',
    silent: false
  })
  notification.show()
}

export function notifyTaskFailed(taskName: string, error: string): void {
  if (!shouldNotify()) return
  const notification = new Notification({
    title: `Task failed: ${taskName}`,
    body: truncate(error, 200),
    silent: false
  })
  notification.show()
}

function shouldNotify(): boolean {
  const setting = getSetting('notifications_enabled')
  return setting !== 'false'
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text
}
