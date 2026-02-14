import { getDatabase } from './index'
import * as queries from '../../shared/db-queries'
import type { Task, TaskRun, CreateTaskInput, Watch } from '../../shared/types'

// ─── Tasks ──────────────────────────────────────────────────

export function createTask(input: CreateTaskInput): Task {
  return queries.createTask(getDatabase(), input)
}

export function getTask(id: number): Task | null {
  return queries.getTask(getDatabase(), id)
}

export function listTasks(status?: string): Task[] {
  return queries.listTasks(getDatabase(), status)
}

export function updateTask(id: number, updates: Partial<{
  name: string; description: string; prompt: string; cronExpression: string
  triggerType: string; triggerConfig: string; scheduledAt: string; executor: string
  status: string; lastRun: string; lastResult: string; errorCount: number
  maxRuns: number; runCount: number
}>): void {
  return queries.updateTask(getDatabase(), id, updates)
}

export function deleteTask(id: number): void {
  return queries.deleteTask(getDatabase(), id)
}

export function pauseTask(id: number): void {
  return queries.pauseTask(getDatabase(), id)
}

export function resumeTask(id: number): void {
  return queries.resumeTask(getDatabase(), id)
}

// ─── Task Runs ──────────────────────────────────────────────

export function createTaskRun(taskId: number): TaskRun {
  return queries.createTaskRun(getDatabase(), taskId)
}

export function getTaskRun(id: number): TaskRun | null {
  return queries.getTaskRun(getDatabase(), id)
}

export function completeTaskRun(id: number, result: string, resultFile?: string, errorMessage?: string): void {
  return queries.completeTaskRun(getDatabase(), id, result, resultFile, errorMessage)
}

export function getTaskRuns(taskId: number, limit: number = 20): TaskRun[] {
  return queries.getTaskRuns(getDatabase(), taskId, limit)
}

export function getLatestTaskRun(taskId: number): TaskRun | null {
  return queries.getLatestTaskRun(getDatabase(), taskId)
}

export function listAllRuns(limit: number = 20): TaskRun[] {
  return queries.listAllRuns(getDatabase(), limit)
}

export function getDueOnceTasks(): Task[] {
  return queries.getDueOnceTasks(getDatabase())
}

export function updateTaskRunProgress(runId: number, progress: number | null, progressMessage: string | null): void {
  return queries.updateTaskRunProgress(getDatabase(), runId, progress, progressMessage)
}

export function getRunningTaskRuns(): TaskRun[] {
  return queries.getRunningTaskRuns(getDatabase())
}

// ─── Watches ────────────────────────────────────────────────

export function createWatch(path: string, description?: string, actionPrompt?: string): Watch {
  const db = getDatabase()
  const result = db
    .prepare('INSERT INTO watches (path, description, action_prompt) VALUES (?, ?, ?)')
    .run(path, description ?? null, actionPrompt ?? null)
  return getWatch(result.lastInsertRowid as number)!
}

export function getWatch(id: number): Watch | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM watches WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapWatchRow(row) : null
}

export function listWatches(status?: string): Watch[] {
  const db = getDatabase()
  const rows = status
    ? db.prepare('SELECT * FROM watches WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM watches ORDER BY created_at DESC').all()
  return (rows as Record<string, unknown>[]).map(mapWatchRow)
}

export function deleteWatch(id: number): void {
  getDatabase().prepare('DELETE FROM watches WHERE id = ?').run(id)
}

// ─── Settings ───────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDatabase()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`
    )
    .run(key, value, value)
}

export function getAllSettings(): Record<string, string> {
  const rows = getDatabase().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
}

// ─── Row Mappers ────────────────────────────────────────────

function mapWatchRow(row: Record<string, unknown>): Watch {
  return {
    id: row.id as number,
    path: row.path as string,
    description: row.description as string | null,
    actionPrompt: row.action_prompt as string | null,
    status: row.status as string,
    lastTriggered: row.last_triggered as string | null,
    triggerCount: row.trigger_count as number,
    createdAt: row.created_at as string
  }
}
