import { getDatabase } from '../db'
import { getConfig } from '../config'
import { notifyTaskComplete, notifyTaskFailed } from '../notifications'
import { executeTask as sharedExecuteTask } from '../../shared/task-runner'
import { isInQuietHours, enqueueNudge } from '../../shared/auto-nudge'
import * as queries from '../../shared/db-queries'

export async function executeTask(taskId: number): Promise<void> {
  const config = getConfig()
  const db = getDatabase()

  const result = await sharedExecuteTask(taskId, {
    db,
    resultsDir: config.resultsDir,
    onComplete: (task, output, durationMs) => {
      console.log(`Task ${taskId} (${task.name}) completed in ${durationMs}ms`)
      notifyTaskComplete(task.name, output)
      tryNudge(db, taskId, task.name, true, durationMs)
    },
    onFailed: (task, error) => {
      console.error(`Task ${taskId} (${task.name}) failed: ${error}`)
      notifyTaskFailed(task.name, error)
      tryNudge(db, taskId, task.name, false, 0, error)
    }
  })

  if (!result.success && result.errorMessage) {
    console.log(`Task ${taskId}: ${result.errorMessage}`)
  }
}

function tryNudge(
  db: ReturnType<typeof getDatabase>,
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
