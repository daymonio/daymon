import type Database from 'better-sqlite3'
import type { Entity, Observation, Relation, MemoryStats, Task, CreateTaskInput, TaskRun } from './types'

// ─── Entities ───────────────────────────────────────────────

export function createEntity(db: Database.Database, name: string, type: string = 'fact', category?: string): Entity {
  const result = db
    .prepare('INSERT INTO entities (name, type, category) VALUES (?, ?, ?)')
    .run(name, type, category ?? null)
  return getEntity(db, result.lastInsertRowid as number)!
}

export function getEntity(db: Database.Database, id: number): Entity | null {
  const row = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Entity | undefined
  return row ?? null
}

export function listEntities(db: Database.Database, category?: string): Entity[] {
  if (category) {
    return db
      .prepare('SELECT * FROM entities WHERE category = ? ORDER BY updated_at DESC')
      .all(category) as Entity[]
  }
  return db.prepare('SELECT * FROM entities ORDER BY updated_at DESC').all() as Entity[]
}

export function updateEntity(db: Database.Database, id: number, updates: { name?: string; type?: string; category?: string }): void {
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type) }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category) }
  if (fields.length === 0) return

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  db.prepare(`UPDATE entities SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteEntity(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM entities WHERE id = ?').run(id)
}

export function searchEntities(db: Database.Database, query: string): Entity[] {
  try {
    const ftsResults = db
      .prepare(
        `SELECT e.* FROM entities e
         INNER JOIN memory_fts fts ON e.id = fts.rowid
         WHERE memory_fts MATCH ?
         ORDER BY rank`
      )
      .all(query) as Entity[]

    if (ftsResults.length > 0) return ftsResults
  } catch {
    // FTS parse error (special characters in query) — fall through to LIKE
  }

  return db
    .prepare('SELECT * FROM entities WHERE name LIKE ? OR category LIKE ? ORDER BY updated_at DESC')
    .all(`%${query}%`, `%${query}%`) as Entity[]
}

// ─── Observations ───────────────────────────────────────────

export function addObservation(db: Database.Database, entityId: number, content: string, source: string = 'claude'): Observation {
  const result = db
    .prepare('INSERT INTO observations (entity_id, content, source) VALUES (?, ?, ?)')
    .run(entityId, content, source)
  db.prepare('UPDATE entities SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(entityId)
  return getObservation(db, result.lastInsertRowid as number)!
}

export function getObservation(db: Database.Database, id: number): Observation | null {
  const row = db.prepare('SELECT * FROM observations WHERE id = ?').get(id) as Observation | undefined
  return row ?? null
}

export function getObservations(db: Database.Database, entityId: number): Observation[] {
  return db
    .prepare('SELECT * FROM observations WHERE entity_id = ? ORDER BY created_at DESC')
    .all(entityId) as Observation[]
}

export function deleteObservation(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM observations WHERE id = ?').run(id)
}

// ─── Relations ──────────────────────────────────────────────

export function addRelation(db: Database.Database, fromEntity: number, toEntity: number, relationType: string): Relation {
  const result = db
    .prepare('INSERT INTO relations (from_entity, to_entity, relation_type) VALUES (?, ?, ?)')
    .run(fromEntity, toEntity, relationType)
  return getRelation(db, result.lastInsertRowid as number)!
}

export function getRelation(db: Database.Database, id: number): Relation | null {
  const row = db.prepare('SELECT * FROM relations WHERE id = ?').get(id) as Relation | undefined
  return row ?? null
}

export function getRelations(db: Database.Database, entityId: number): Relation[] {
  return db
    .prepare('SELECT * FROM relations WHERE from_entity = ? OR to_entity = ? ORDER BY created_at DESC')
    .all(entityId, entityId) as Relation[]
}

export function deleteRelation(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM relations WHERE id = ?').run(id)
}

// ─── Stats ──────────────────────────────────────────────────

export function getMemoryStats(db: Database.Database): MemoryStats {
  const entities = db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number }
  const observations = db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number }
  const relations = db.prepare('SELECT COUNT(*) as count FROM relations').get() as { count: number }
  return {
    entityCount: entities.count,
    observationCount: observations.count,
    relationCount: relations.count
  }
}

// ─── Tasks ──────────────────────────────────────────────────

export function createTask(db: Database.Database, input: CreateTaskInput): Task {
  const result = db
    .prepare(
      `INSERT INTO tasks (name, description, prompt, cron_expression, trigger_type, trigger_config, scheduled_at, executor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.description ?? null,
      input.prompt,
      input.cronExpression ?? null,
      input.triggerType ?? 'cron',
      input.triggerConfig ?? null,
      input.scheduledAt ?? null,
      input.executor ?? 'claude_code'
    )
  return getTask(db, result.lastInsertRowid as number)!
}

export function getTask(db: Database.Database, id: number): Task | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapTaskRow(row) : null
}

export function listTasks(db: Database.Database, status?: string): Task[] {
  const rows = status
    ? db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
  return (rows as Record<string, unknown>[]).map(mapTaskRow)
}

export function updateTask(db: Database.Database, id: number, updates: Partial<{
  name: string; description: string; prompt: string; cronExpression: string
  triggerType: string; triggerConfig: string; scheduledAt: string; executor: string
  status: string; lastRun: string; lastResult: string; errorCount: number
}>): void {
  const fieldMap: Record<string, string> = {
    name: 'name', description: 'description', prompt: 'prompt',
    cronExpression: 'cron_expression', triggerType: 'trigger_type',
    triggerConfig: 'trigger_config', scheduledAt: 'scheduled_at',
    executor: 'executor', status: 'status',
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

export function deleteTask(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export function pauseTask(db: Database.Database, id: number): void {
  updateTask(db, id, { status: 'paused' })
}

export function resumeTask(db: Database.Database, id: number): void {
  updateTask(db, id, { status: 'active' })
}

// ─── Task Runs ──────────────────────────────────────────────

export function createTaskRun(db: Database.Database, taskId: number): TaskRun {
  const result = db.prepare('INSERT INTO task_runs (task_id) VALUES (?)').run(taskId)
  return getTaskRun(db, result.lastInsertRowid as number)!
}

export function getTaskRun(db: Database.Database, id: number): TaskRun | null {
  const row = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapTaskRunRow(row) : null
}

export function completeTaskRun(db: Database.Database, id: number, result: string, resultFile?: string, errorMessage?: string): void {
  const run = getTaskRun(db, id)
  if (!run) return

  const status = errorMessage ? 'failed' : 'completed'
  const durationMs = Date.now() - new Date(run.startedAt).getTime()

  db.prepare(
    `UPDATE task_runs SET finished_at = CURRENT_TIMESTAMP, status = ?, result = ?,
     result_file = ?, error_message = ?, duration_ms = ? WHERE id = ?`
  ).run(status, result, resultFile ?? null, errorMessage ?? null, durationMs, id)

  const task = getTask(db, run.taskId)
  updateTask(db, run.taskId, {
    lastRun: new Date().toISOString(),
    lastResult: result,
    errorCount: errorMessage ? (task?.errorCount ?? 0) + 1 : 0
  })
}

export function getTaskRuns(db: Database.Database, taskId: number, limit: number = 20): TaskRun[] {
  const rows = db
    .prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(taskId, limit)
  return (rows as Record<string, unknown>[]).map(mapTaskRunRow)
}

export function listAllRuns(db: Database.Database, limit: number = 20): TaskRun[] {
  const rows = db
    .prepare('SELECT * FROM task_runs ORDER BY started_at DESC LIMIT ?')
    .all(limit)
  return (rows as Record<string, unknown>[]).map(mapTaskRunRow)
}

export function getLatestTaskRun(db: Database.Database, taskId: number): TaskRun | null {
  const row = db
    .prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(taskId) as Record<string, unknown> | undefined
  return row ? mapTaskRunRow(row) : null
}

// ─── One-Time & Progress Queries ────────────────────────────

export function getDueOnceTasks(db: Database.Database): Task[] {
  const rows = db
    .prepare(
      `SELECT * FROM tasks
       WHERE trigger_type = 'once'
         AND status = 'active'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= datetime('now')
       ORDER BY scheduled_at ASC`
    )
    .all()
  return (rows as Record<string, unknown>[]).map(mapTaskRow)
}

export function updateTaskRunProgress(db: Database.Database, runId: number, progress: number | null, progressMessage: string | null): void {
  db.prepare(
    'UPDATE task_runs SET progress = ?, progress_message = ? WHERE id = ?'
  ).run(progress, progressMessage, runId)
}

export function getRunningTaskRuns(db: Database.Database): TaskRun[] {
  const rows = db
    .prepare("SELECT * FROM task_runs WHERE status = 'running' ORDER BY started_at DESC")
    .all()
  return (rows as Record<string, unknown>[]).map(mapTaskRunRow)
}

// ─── Task Row Mappers ───────────────────────────────────────

function mapTaskRow(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    name: row.name as string,
    description: row.description as string | null,
    prompt: row.prompt as string,
    cronExpression: row.cron_expression as string | null,
    triggerType: row.trigger_type as string,
    triggerConfig: row.trigger_config as string | null,
    scheduledAt: row.scheduled_at as string | null,
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
    durationMs: row.duration_ms as number | null,
    progress: row.progress as number | null,
    progressMessage: row.progress_message as string | null
  }
}
