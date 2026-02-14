import cron from 'node-cron'
import { listTasks, getDueOnceTasks, updateTask } from '../db/tasks'
import { executeTask } from './runner'
import type { Task } from '../../shared/types'

const scheduledJobs = new Map<number, cron.ScheduledTask>()
const pendingOnceTasks = new Set<number>()
let pollTimer: ReturnType<typeof setInterval> | null = null

const POLL_INTERVAL_MS = 30_000 // 30 seconds

export function startScheduler(): void {
  console.log('Starting scheduler...')
  syncWithDatabase()
  pollTimer = setInterval(syncWithDatabase, POLL_INTERVAL_MS)
}

export function stopScheduler(): void {
  console.log('Stopping scheduler...')
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  for (const [taskId, job] of scheduledJobs) {
    job.stop()
    scheduledJobs.delete(taskId)
  }
}

export function syncWithDatabase(): void {
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
        updateTask(task.id, { status: 'completed' })
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

export function getSchedulerStatus(): { running: boolean; jobCount: number; jobs: Array<{ taskId: number }> } {
  return {
    running: pollTimer !== null,
    jobCount: scheduledJobs.size,
    jobs: Array.from(scheduledJobs.keys()).map((taskId) => ({ taskId }))
  }
}
