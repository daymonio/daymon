import cron from 'node-cron'
import { listTasks, getDueOnceTasks, updateTask, cleanupStaleRuns } from '../db/tasks'
import { executeTask } from './runner'
import { getDatabase } from '../db'
import { indexPendingEmbeddings } from '../../shared/embedding-indexer'
import { initEngine } from '../../shared/embeddings'
import type { Task } from '../../shared/types'

const scheduledJobs = new Map<number, cron.ScheduledTask>()
const pendingOnceTasks = new Set<number>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let embeddingTimer: ReturnType<typeof setInterval> | null = null

const POLL_INTERVAL_MS = 30_000 // 30 seconds
const EMBEDDING_INDEX_INTERVAL_MS = 5 * 60_000 // 5 minutes

export function startScheduler(): void {
  console.log('Starting scheduler...')
  syncWithDatabase()
  pollTimer = setInterval(syncWithDatabase, POLL_INTERVAL_MS)

  // Background embedding indexer (lazy — init engine then index every 5 minutes)
  initEngine().catch(() => { /* non-fatal: embeddings are optional */ })
  embeddingTimer = setInterval(runEmbeddingIndexer, EMBEDDING_INDEX_INTERVAL_MS)
}

export function stopScheduler(): void {
  console.log('Stopping scheduler...')
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (embeddingTimer) {
    clearInterval(embeddingTimer)
    embeddingTimer = null
  }
  for (const [taskId, job] of scheduledJobs) {
    job.stop()
    scheduledJobs.delete(taskId)
  }
}

export function syncWithDatabase(): void {
  // Clean up any stale runs (process died, timeout exceeded)
  try {
    const cleaned = cleanupStaleRuns()
    if (cleaned > 0) {
      console.log(`Scheduler: cleaned up ${cleaned} stale task run(s)`)
    }
  } catch {
    // non-fatal
  }

  const activeTasks = listTasks('active')
  const activeTaskIds = new Set(activeTasks.map((t) => t.id))

  // Remove jobs for tasks that no longer exist or are no longer active
  for (const [taskId, job] of scheduledJobs) {
    if (!activeTaskIds.has(taskId)) {
      job.stop()
      scheduledJobs.delete(taskId)
    }
  }

  // Add/update jobs for active cron tasks
  for (const task of activeTasks) {
    if (task.triggerType !== 'cron' || !task.cronExpression) continue
    if (scheduledJobs.has(task.id)) continue // Already scheduled

    scheduleTask(task)
  }

  // Check and fire due one-time tasks
  checkDueOnceTasks()

  const jobCount = scheduledJobs.size
  if (jobCount > 0) {
    console.log(`Scheduler: ${jobCount} active cron job(s)`)
  }
}

function checkDueOnceTasks(): void {
  const dueTasks = getDueOnceTasks()

  for (const task of dueTasks) {
    if (pendingOnceTasks.has(task.id)) continue

    pendingOnceTasks.add(task.id)
    console.log(`One-time task ${task.id} (${task.name}) is due, executing...`)

    executeTask(task.id)
      .then(() => {
        updateTask(task.id, { status: 'completed' })
      })
      .catch((err) => {
        console.error(`Failed to execute one-time task ${task.id}:`, err)
        // Keep active so scheduler can retry on next poll
      })
      .finally(() => {
        pendingOnceTasks.delete(task.id)
      })
  }
}

function scheduleTask(task: Task): void {
  if (!task.cronExpression) return

  if (!cron.validate(task.cronExpression)) {
    console.error(`Invalid cron expression for task ${task.id} (${task.name}): ${task.cronExpression}`)
    return
  }

  const job = cron.schedule(task.cronExpression, () => {
    console.log(`Cron triggered task ${task.id}: ${task.name}`)
    executeTask(task.id).catch((err) => {
      console.error(`Failed to execute task ${task.id}:`, err)
    })
  })

  scheduledJobs.set(task.id, job)
  console.log(`Scheduled task ${task.id} (${task.name}): ${task.cronExpression}`)
}

function runEmbeddingIndexer(): void {
  try {
    const db = getDatabase()
    indexPendingEmbeddings(db, 10).catch((err) => {
      console.error('Embedding indexer error:', err)
    })
  } catch {
    // Non-fatal: DB might not be ready yet
  }
}

export function getSchedulerStatus(): { running: boolean; jobCount: number; jobs: Array<{ taskId: number }> } {
  return {
    running: pollTimer !== null,
    jobCount: scheduledJobs.size,
    jobs: Array.from(scheduledJobs.keys()).map((taskId) => ({ taskId }))
  }
}
