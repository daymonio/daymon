/**
 * Cron scheduler — adapted from src/main/scheduler/cron.ts for the sidecar.
 * Pure Node.js, no Electron dependencies.
 */

import cron from 'node-cron'
import type Database from 'better-sqlite3'
import * as queries from '../shared/db-queries'
import { executeTask } from '../shared/task-runner'
import { indexPendingEmbeddings } from '../shared/embedding-indexer'
import { initEngine } from '../shared/embeddings'
import { notifyTaskComplete, notifyTaskFailed } from './notifications'
import type { Task } from '../shared/types'

let db: Database.Database

const scheduledJobs = new Map<number, cron.ScheduledTask>()
const pendingOnceTasks = new Set<number>()
let pollTimer: ReturnType<typeof setInterval> | null = null
let embeddingTimer: ReturnType<typeof setInterval> | null = null

const POLL_INTERVAL_MS = 30_000
const EMBEDDING_INDEX_INTERVAL_MS = 5 * 60_000

export function startScheduler(database: Database.Database, resultsDir: string): void {
  db = database
  console.log('Sidecar: Starting scheduler...')
  syncWithDatabase(resultsDir)
  pollTimer = setInterval(() => syncWithDatabase(resultsDir), POLL_INTERVAL_MS)

  initEngine().catch(() => { /* non-fatal */ })
  embeddingTimer = setInterval(() => runEmbeddingIndexer(), EMBEDDING_INDEX_INTERVAL_MS)
}

export function stopScheduler(): void {
  console.log('Sidecar: Stopping scheduler...')
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (embeddingTimer) { clearInterval(embeddingTimer); embeddingTimer = null }
  for (const [taskId, job] of scheduledJobs) {
    job.stop()
    scheduledJobs.delete(taskId)
  }
}

export function syncNow(resultsDir: string): void {
  syncWithDatabase(resultsDir)
}

function syncWithDatabase(resultsDir: string): void {
  try {
    const cleaned = queries.cleanupStaleRuns(db)
    if (cleaned > 0) console.log(`Sidecar: cleaned up ${cleaned} stale task run(s)`)
  } catch { /* non-fatal */ }

  try {
    const pruned = queries.pruneOldRuns(db)
    if (pruned > 0) console.log(`Sidecar: pruned ${pruned} old run/log record(s)`)
  } catch { /* non-fatal */ }

  const activeTasks = queries.listTasks(db, 'active')
  const activeTaskIds = new Set(activeTasks.map((t) => t.id))

  for (const [taskId, job] of scheduledJobs) {
    if (!activeTaskIds.has(taskId)) {
      job.stop()
      scheduledJobs.delete(taskId)
    }
  }

  for (const task of activeTasks) {
    if (task.triggerType !== 'cron' || !task.cronExpression) continue
    if (scheduledJobs.has(task.id)) continue
    scheduleTask(task, resultsDir)
  }

  checkDueOnceTasks(resultsDir)

  const jobCount = scheduledJobs.size
  if (jobCount > 0) {
    console.log(`Sidecar: ${jobCount} active cron job(s)`)
  }
}

function checkDueOnceTasks(resultsDir: string): void {
  const dueTasks = queries.getDueOnceTasks(db)

  for (const task of dueTasks) {
    if (pendingOnceTasks.has(task.id)) continue
    pendingOnceTasks.add(task.id)
    console.log(`Sidecar: One-time task ${task.id} (${task.name}) is due, executing...`)

    runTask(task.id, resultsDir)
      .then(() => {
        queries.updateTask(db, task.id, { status: 'completed' })
      })
      .catch((err) => {
        console.error(`Sidecar: Failed to execute one-time task ${task.id}:`, err)
      })
      .finally(() => {
        pendingOnceTasks.delete(task.id)
      })
  }
}

function scheduleTask(task: Task, resultsDir: string): void {
  if (!task.cronExpression) return

  if (!cron.validate(task.cronExpression)) {
    console.error(`Sidecar: Invalid cron expression for task ${task.id} (${task.name}): ${task.cronExpression}`)
    return
  }

  const job = cron.schedule(task.cronExpression, () => {
    console.log(`Sidecar: Cron triggered task ${task.id}: ${task.name}`)
    runTask(task.id, resultsDir).catch((err) => {
      console.error(`Sidecar: Failed to execute task ${task.id}:`, err)
    })
  })

  scheduledJobs.set(task.id, job)
  console.log(`Sidecar: Scheduled task ${task.id} (${task.name}): ${task.cronExpression}`)
}

async function runTask(taskId: number, resultsDir: string): Promise<void> {
  const task = queries.getTask(db, taskId)
  if (!task) {
    console.error(`Sidecar: Task ${taskId} not found`)
    return
  }

  const result = await executeTask(taskId, { db, resultsDir })

  if (result.success) {
    console.log(`Sidecar: Task ${taskId} (${task.name}) completed in ${result.durationMs}ms`)
    notifyTaskComplete(db, taskId, task.name, result.output?.slice(0, 200), result.durationMs)
  } else {
    const error = result.errorMessage || 'Unknown error'
    console.error(`Sidecar: Task ${taskId} (${task.name}) failed: ${error}`)
    notifyTaskFailed(db, taskId, task.name, error)
  }
}

function runEmbeddingIndexer(): void {
  try {
    indexPendingEmbeddings(db, 10).catch((err) => {
      console.error('Sidecar: Embedding indexer error:', err)
    })
  } catch { /* non-fatal */ }
}

export function getSchedulerStatus(): { running: boolean; jobCount: number; jobs: Array<{ taskId: number }> } {
  return {
    running: pollTimer !== null,
    jobCount: scheduledJobs.size,
    jobs: Array.from(scheduledJobs.keys()).map((taskId) => ({ taskId }))
  }
}
