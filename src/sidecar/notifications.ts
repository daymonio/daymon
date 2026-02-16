/**
 * Sidecar notification helpers — emits SSE events and triggers auto-nudge.
 * Electron listens to SSE events and shows native Notification.
 */

import type Database from 'better-sqlite3'
import { emitEvent } from './events'
import { isInQuietHours, enqueueNudge } from '../shared/auto-nudge'
import * as queries from '../shared/db-queries'

export function notifyTaskComplete(
  db: Database.Database,
  taskId: number,
  taskName: string,
  outputPreview: string | undefined,
  durationMs: number
): void {
  emitEvent('task:complete', { taskId, taskName, success: true, outputPreview, durationMs })
  tryNudge(db, taskId, taskName, true, durationMs)
}

export function notifyTaskFailed(
  db: Database.Database,
  taskId: number,
  taskName: string,
  errorMessage: string
): void {
  emitEvent('task:failed', { taskId, taskName, success: false, errorMessage })
  tryNudge(db, taskId, taskName, false, 0, errorMessage)
}

function tryNudge(
  db: Database.Database,
  taskId: number,
  taskName: string,
  success: boolean,
  durationMs: number,
  errorMessage?: string
): void {
  try {
    if (queries.getSetting(db, 'auto_nudge_enabled') !== 'true') return
    if (isInQuietHours(db)) return
    setTimeout(() => enqueueNudge({ taskId, taskName, success, durationMs, errorMessage }), 500)
  } catch { /* non-fatal */ }
}
