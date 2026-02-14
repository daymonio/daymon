import { getDatabase } from './index'
import type { Task, TaskRun, CreateTaskInput, Watch } from '../../shared/types'

// ─── Tasks ──────────────────────────────────────────────────

export function createTask(input: CreateTaskInput): Task {
  const db = getDatabase()
  const result = db
    .prepare(
      `INSERT INTO tasks (name, description, prompt, cron_expression, trigger_type, trigger_config, executor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.description ?? null,
      input.prompt,
      input.cronExpression ?? null,
      input.triggerType ?? 'cron',
      input.triggerConfig ?? null,
      input.executor ?? 'claude_code'
    )
  return getTask(result.lastInsertRowid as number)!
}

export function getTask(id: number): Task | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapTaskRow(row) : null
}

export function listTasks(status?: string): Task[] {
  const db = getDatabase()
  const rows = status
    ? db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
  return (rows as Record<string, unknown>[]).map(mapTaskRow)
}

export function updateTask(id: number, updates: Partial<{
  name: string
  description: string
  prompt: string
  cronExpression: string
  triggerType: string
  triggerConfig: string
  executor: string
  status: string
  lastRun: string
  lastResult: string
  errorCount: number
}>): void {
  const db = getDatabase()
  const fieldMap: Record<string, string> = {
    name: 'name', description: 'description', prompt: 'prompt',
    cronExpression: 'cron_expression', triggerType: 'trigger_type',
    triggerConfig: 'trigger_config', executor: 'executor', status: 'status',
    lastRun: 'last_run', lastResult: 'last_result', errorCount: 'error_count'
  }

  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(updates)) {
    const dbField = fieldMap[key]
    if (dbField) { fields.push(`${dbField} = ?`); values.push(value) }
  }
  if (fields.length === 0) return

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteTask(id: number): void {
  getDatabase().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export function pauseTask(id: number): void {
  updateTask(id, { status: 'paused' })
}

export function resumeTask(id: number): void {
  updateTask(id, { status: 'active' })
}

// ─── Task Runs ──────────────────────────────────────────────

export function createTaskRun(taskId: number): TaskRun {
  const db = getDatabase()
  const result = db.prepare('INSERT INTO task_runs (task_id) VALUES (?)').run(taskId)
  return getTaskRun(result.lastInsertRowid as number)!
}

export function getTaskRun(id: number): TaskRun | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapTaskRunRow(row) : null
}

export function completeTaskRun(id: number, result: string, resultFile?: string, errorMessage?: string): void {
  const db = getDatabase()
  const run = getTaskRun(id)
  if (!run) return

  const status = errorMessage ? 'failed' : 'completed'
  const durationMs = Date.now() - new Date(run.startedAt).getTime()

  db.prepare(
    `UPDATE task_runs SET finished_at = CURRENT_TIMESTAMP, status = ?, result = ?,
     result_file = ?, error_message = ?, duration_ms = ? WHERE id = ?`
  ).run(status, result, resultFile ?? null, errorMessage ?? null, durationMs, id)

  updateTask(run.taskId, {
    lastRun: new Date().toISOString(),
    lastResult: result,
    errorCount: errorMessage ? (getTask(run.taskId)?.errorCount ?? 0) + 1 : 0
  })
}

export function getTaskRuns(taskId: number, limit: number = 20): TaskRun[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(taskId, limit)
  return (rows as Record<string, unknown>[]).map(mapTaskRunRow)
}

export function getLatestTaskRun(taskId: number): TaskRun | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(taskId) as Record<string, unknown> | undefined
  return row ? mapTaskRunRow(row) : null
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

// ─── Row Mappers (snake_case → camelCase) ───────────────────

function mapTaskRow(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    name: row.name as string,
    description: row.description as string | null,
    prompt: row.prompt as string,
    cronExpression: row.cron_expression as string | null,
    triggerType: row.trigger_type as string,
    triggerConfig: row.trigger_config as string | null,
    executor: row.executor as string,
    status: row.status as string,
    lastRun: row.last_run as string | null,
    lastResult: row.last_result as string | null,
    errorCount: row.error_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

function mapTaskRunRow(row: Record<string, unknown>): TaskRun {
  return {
    id: row.id as number,
    taskId: row.task_id as number,
    startedAt: row.started_at as string,
    finishedAt: row.finished_at as string | null,
    status: row.status as string,
    result: row.result as string | null,
    resultFile: row.result_file as string | null,
    errorMessage: row.error_message as string | null,
    durationMs: row.duration_ms as number | null
  }
}

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
