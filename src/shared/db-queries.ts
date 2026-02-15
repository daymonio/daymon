import type Database from 'better-sqlite3'
import type { Entity, Observation, Relation, MemoryStats, Task, CreateTaskInput, TaskRun, Worker, CreateWorkerInput, TriggerType, TaskStatus, Watch } from './types'

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

  // Escape LIKE wildcards to prevent wildcard injection
  const escaped = query.replace(/[%_]/g, '\\$&')
  return db
    .prepare("SELECT * FROM entities WHERE name LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' ORDER BY updated_at DESC")
    .all(`%${escaped}%`, `%${escaped}%`) as Entity[]
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
    .prepare('SELECT * FROM observations WHERE entity_id = ? ORDER BY id DESC')
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

// ─── Workers ────────────────────────────────────────────────

export function createWorker(db: Database.Database, input: CreateWorkerInput): Worker {
  if (input.isDefault) {
    db.prepare('UPDATE workers SET is_default = 0 WHERE is_default = 1').run()
  }
  const result = db
    .prepare(
      `INSERT INTO workers (name, system_prompt, description, model, is_default)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(input.name, input.systemPrompt, input.description ?? null, input.model ?? null, input.isDefault ? 1 : 0)
  return getWorker(db, result.lastInsertRowid as number)!
}

export function getWorker(db: Database.Database, id: number): Worker | null {
  const row = db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapWorkerRow(row) : null
}

export function listWorkers(db: Database.Database): Worker[] {
  const rows = db.prepare('SELECT * FROM workers ORDER BY is_default DESC, name ASC').all()
  return (rows as Record<string, unknown>[]).map(mapWorkerRow)
}

export function getWorkerCount(db: Database.Database): number {
  const row = db.prepare('SELECT count(*) as cnt FROM workers').get() as { cnt: number }
  return row.cnt
}

export function updateWorker(db: Database.Database, id: number, updates: Partial<{
  name: string; systemPrompt: string; description: string; model: string; isDefault: boolean
}>): void {
  if (updates.isDefault === true) {
    db.prepare('UPDATE workers SET is_default = 0 WHERE is_default = 1').run()
  }
  const fieldMap: Record<string, string> = {
    name: 'name', systemPrompt: 'system_prompt', description: 'description',
    model: 'model', isDefault: 'is_default'
  }
  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(updates)) {
    const dbField = fieldMap[key]
    if (dbField) {
      fields.push(`${dbField} = ?`)
      values.push(key === 'isDefault' ? (value ? 1 : 0) : value)
    }
  }
  if (fields.length === 0) return

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  db.prepare(`UPDATE workers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteWorker(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM workers WHERE id = ?').run(id)
}

export function getDefaultWorker(db: Database.Database): Worker | null {
  const row = db.prepare('SELECT * FROM workers WHERE is_default = 1 LIMIT 1').get() as Record<string, unknown> | undefined
  return row ? mapWorkerRow(row) : null
}

export function refreshWorkerTaskCount(db: Database.Database, workerId: number): void {
  const row = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE worker_id = ?').get(workerId) as { count: number }
  db.prepare('UPDATE workers SET task_count = ? WHERE id = ?').run(row.count, workerId)
}

function mapWorkerRow(row: Record<string, unknown>): Worker {
  return {
    id: row.id as number,
    name: row.name as string,
    systemPrompt: row.system_prompt as string,
    description: row.description as string | null,
    model: row.model as string | null,
    isDefault: (row.is_default as number) === 1,
    taskCount: (row.task_count as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

// ─── Tasks ──────────────────────────────────────────────────

export function createTask(db: Database.Database, input: CreateTaskInput): Task {
  const result = db
    .prepare(
      `INSERT INTO tasks (name, description, prompt, cron_expression, trigger_type, trigger_config, scheduled_at, executor, max_runs, worker_id, session_continuity, timeout_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.description ?? null,
      input.prompt,
      input.cronExpression ?? null,
      input.triggerType ?? 'cron',
      input.triggerConfig ?? null,
      input.scheduledAt ?? null,
      input.executor ?? 'claude_code',
      input.maxRuns ?? null,
      input.workerId ?? null,
      input.sessionContinuity ? 1 : 0,
      input.timeoutMinutes ?? null
    )
  const task = getTask(db, result.lastInsertRowid as number)!
  if (input.workerId) refreshWorkerTaskCount(db, input.workerId)
  return task
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
  triggerType: TriggerType; triggerConfig: string; scheduledAt: string; executor: string
  status: TaskStatus; lastRun: string; lastResult: string; errorCount: number
  maxRuns: number; runCount: number; memoryEntityId: number
  workerId: number | null; sessionContinuity: boolean; sessionId: string | null
  timeoutMinutes: number | null
}>): void {
  const fieldMap: Record<string, string> = {
    name: 'name', description: 'description', prompt: 'prompt',
    cronExpression: 'cron_expression', triggerType: 'trigger_type',
    triggerConfig: 'trigger_config', scheduledAt: 'scheduled_at',
    executor: 'executor', status: 'status',
    lastRun: 'last_run', lastResult: 'last_result', errorCount: 'error_count',
    maxRuns: 'max_runs', runCount: 'run_count', memoryEntityId: 'memory_entity_id',
    workerId: 'worker_id', sessionContinuity: 'session_continuity', sessionId: 'session_id',
    timeoutMinutes: 'timeout_minutes'
  }

  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(updates)) {
    const dbField = fieldMap[key]
    if (dbField) {
      fields.push(`${dbField} = ?`)
      values.push(key === 'sessionContinuity' ? (value ? 1 : 0) : value)
    }
  }
  if (fields.length === 0) return

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteTask(db: Database.Database, id: number): void {
  const task = getTask(db, id)
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  if (task?.workerId) refreshWorkerTaskCount(db, task.workerId)
}

export function pauseTask(db: Database.Database, id: number): void {
  updateTask(db, id, { status: 'paused' })
}

export function resumeTask(db: Database.Database, id: number): void {
  updateTask(db, id, { status: 'active' })
}

// ─── Watches ────────────────────────────────────────────────

export function createWatch(db: Database.Database, path: string, description?: string, actionPrompt?: string): Watch {
  const result = db
    .prepare('INSERT INTO watches (path, description, action_prompt) VALUES (?, ?, ?)')
    .run(path, description ?? null, actionPrompt ?? null)
  return getWatch(db, result.lastInsertRowid as number)!
}

export function getWatch(db: Database.Database, id: number): Watch | null {
  const row = db.prepare('SELECT * FROM watches WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? mapWatchRow(row) : null
}

export function listWatches(db: Database.Database, status?: string): Watch[] {
  const rows = status
    ? db.prepare('SELECT * FROM watches WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM watches ORDER BY created_at DESC').all()
  return (rows as Record<string, unknown>[]).map(mapWatchRow)
}

export function getWatchCount(db: Database.Database, status?: string): number {
  const row = status
    ? db.prepare('SELECT count(*) as cnt FROM watches WHERE status = ?').get(status) as { cnt: number }
    : db.prepare('SELECT count(*) as cnt FROM watches').get() as { cnt: number }
  return row.cnt
}

export function deleteWatch(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM watches WHERE id = ?').run(id)
}

// ─── Settings ───────────────────────────────────────────────

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`
    )
    .run(key, value, value)
}

export function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
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
         AND datetime(scheduled_at) <= datetime('now')
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

// ─── Memory-Task Integration ────────────────────────────────

const MAX_OWN_OBSERVATIONS = 5
const MAX_RELATED_OBSERVATIONS = 3
const MAX_MEMORY_LENGTH = 2000
const MAX_OBSERVATIONS_PER_ENTITY = 10

function buildRelatedKnowledgeSection(db: Database.Database, task: Task): string | null {
  const words = task.name.split(/\s+/).filter(w => w.length >= 2)
  const relatedMap = new Map<number, Entity>()
  for (const word of words) {
    for (const entity of searchEntities(db, word)) {
      if (entity.id !== task.memoryEntityId) {
        relatedMap.set(entity.id, entity)
      }
    }
  }
  const otherEntities = Array.from(relatedMap.values())
  if (otherEntities.length === 0) return null

  const relatedParts: string[] = []
  for (const entity of otherEntities.slice(0, 5)) {
    const observations = getObservations(db, entity.id)
    if (observations.length > 0) {
      const recent = observations.slice(0, MAX_RELATED_OBSERVATIONS)
      const obsText = recent.map(o => o.content).join('\n')
      relatedParts.push(`**${entity.name}** (${entity.type}):\n${obsText}`)
    }
  }
  return relatedParts.length > 0 ? `## Related knowledge:\n${relatedParts.join('\n\n')}` : null
}

export function getTaskMemoryContext(db: Database.Database, taskId: number): string | null {
  const task = getTask(db, taskId)
  if (!task) return null

  const sections: string[] = []

  // 1. Own task's recent observations
  if (task.memoryEntityId) {
    const entity = getEntity(db, task.memoryEntityId)
    if (entity) {
      const observations = getObservations(db, entity.id)
      if (observations.length > 0) {
        const recent = observations.slice(0, MAX_OWN_OBSERVATIONS)
        const obsText = recent.map(o => `[${o.created_at}] ${o.content}`).join('\n\n')
        sections.push(`## Your previous results:\n${obsText}`)
      }
    }
  }

  // 2. Related knowledge from all memory (other tasks, user memories)
  const relatedSection = buildRelatedKnowledgeSection(db, task)
  if (relatedSection) sections.push(relatedSection)

  return sections.length > 0 ? sections.join('\n\n') : null
}

export function ensureTaskMemoryEntity(db: Database.Database, taskId: number): number {
  const task = getTask(db, taskId)
  if (!task) throw new Error(`Task ${taskId} not found`)

  if (task.memoryEntityId) {
    const existing = getEntity(db, task.memoryEntityId)
    if (existing) return existing.id
  }

  const entity = createEntity(db, `Task: ${task.name}`, 'task_result', 'task')
  updateTask(db, taskId, { memoryEntityId: entity.id })
  return entity.id
}

export function storeTaskResultInMemory(
  db: Database.Database,
  taskId: number,
  result: string,
  success: boolean
): void {
  const entityId = ensureTaskMemoryEntity(db, taskId)

  const truncated = result.length > MAX_MEMORY_LENGTH
    ? result.substring(0, MAX_MEMORY_LENGTH) + '\n[...truncated]'
    : result

  const status = success ? 'SUCCESS' : 'FAILED'
  const content = `[${status}] ${truncated}`

  addObservation(db, entityId, content, 'task_runner')

  // Prune old observations — keep last N to prevent unbounded growth
  const observations = getObservations(db, entityId)
  if (observations.length > MAX_OBSERVATIONS_PER_ENTITY) {
    const toDelete = observations.slice(MAX_OBSERVATIONS_PER_ENTITY)
    for (const obs of toDelete) {
      deleteObservation(db, obs.id)
    }
  }
}

export function incrementRunCount(db: Database.Database, taskId: number): void {
  // Atomic: increment run_count and auto-complete if maxRuns reached in a single statement
  db.prepare(
    `UPDATE tasks SET
       run_count = run_count + 1,
       status = CASE WHEN max_runs IS NOT NULL AND run_count + 1 >= max_runs THEN 'completed' ELSE status END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(taskId)
}

// ─── Task Row Mappers ───────────────────────────────────────

function mapTaskRow(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    name: row.name as string,
    description: row.description as string | null,
    prompt: row.prompt as string,
    cronExpression: row.cron_expression as string | null,
    triggerType: row.trigger_type as TriggerType,
    triggerConfig: row.trigger_config as string | null,
    scheduledAt: row.scheduled_at as string | null,
    executor: row.executor as string,
    status: row.status as TaskStatus,
    lastRun: row.last_run as string | null,
    lastResult: row.last_result as string | null,
    errorCount: row.error_count as number,
    maxRuns: row.max_runs as number | null,
    runCount: (row.run_count as number) ?? 0,
    memoryEntityId: row.memory_entity_id as number | null,
    workerId: row.worker_id as number | null,
    sessionContinuity: (row.session_continuity as number) === 1,
    sessionId: row.session_id as string | null,
    timeoutMinutes: row.timeout_minutes as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
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
    progressMessage: row.progress_message as string | null,
    sessionId: row.session_id as string | null
  }
}

// ─── Session Continuity ────────────────────────────────────

export function updateTaskRunSessionId(db: Database.Database, runId: number, sessionId: string): void {
  db.prepare('UPDATE task_runs SET session_id = ? WHERE id = ?').run(sessionId, runId)
}

export function clearTaskSession(db: Database.Database, taskId: number): void {
  db.prepare('UPDATE tasks SET session_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(taskId)
}

export function getSessionRunCount(db: Database.Database, taskId: number, sessionId: string): number {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM task_runs WHERE task_id = ? AND session_id = ?'
  ).get(taskId, sessionId) as { count: number }
  return row.count
}

export function getCrossTaskMemoryContext(db: Database.Database, taskId: number): string | null {
  const task = getTask(db, taskId)
  if (!task) return null
  return buildRelatedKnowledgeSection(db, task)
}

// ─── Embeddings ────────────────────────────────────────────

export function upsertEmbedding(
  db: Database.Database,
  entityId: number,
  sourceType: 'entity' | 'observation',
  sourceId: number,
  hash: string,
  vector: Buffer,
  model: string,
  dimensions: number
): void {
  db.prepare(
    `INSERT INTO embeddings (entity_id, source_type, source_id, text_hash, vector, model, dimensions)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (source_type, source_id, model) DO UPDATE SET
       text_hash = excluded.text_hash,
       vector = excluded.vector,
       created_at = CURRENT_TIMESTAMP`
  ).run(entityId, sourceType, sourceId, hash, vector, model, dimensions)

  db.prepare('UPDATE entities SET embedded_at = CURRENT_TIMESTAMP WHERE id = ?').run(entityId)
}

export function getEmbeddingsForEntity(db: Database.Database, entityId: number): Array<{
  sourceType: string; sourceId: number; vector: Buffer; textHash: string
}> {
  const rows = db.prepare(
    'SELECT source_type, source_id, vector, text_hash FROM embeddings WHERE entity_id = ?'
  ).all(entityId) as Array<Record<string, unknown>>
  return rows.map(r => ({
    sourceType: r.source_type as string,
    sourceId: r.source_id as number,
    vector: r.vector as Buffer,
    textHash: r.text_hash as string
  }))
}

export function getAllEmbeddings(db: Database.Database): Array<{
  entityId: number; sourceType: string; sourceId: number; vector: Buffer
}> {
  const rows = db.prepare(
    'SELECT entity_id, source_type, source_id, vector FROM embeddings'
  ).all() as Array<Record<string, unknown>>
  return rows.map(r => ({
    entityId: r.entity_id as number,
    sourceType: r.source_type as string,
    sourceId: r.source_id as number,
    vector: r.vector as Buffer
  }))
}

export function deleteEmbeddingsForEntity(db: Database.Database, entityId: number): void {
  db.prepare('DELETE FROM embeddings WHERE entity_id = ?').run(entityId)
}

export function getUnembeddedEntities(db: Database.Database, limit: number = 50): Entity[] {
  return db.prepare(
    'SELECT * FROM entities WHERE embedded_at IS NULL ORDER BY created_at ASC LIMIT ?'
  ).all(limit) as Entity[]
}

// ─── Hybrid Search (FTS + Semantic) ───────────────────────

interface HybridSearchResult {
  entity: Entity
  ftsScore: number
  semanticScore: number
  combinedScore: number
}

export function hybridSearch(
  db: Database.Database,
  query: string,
  semanticResults: Array<{ entityId: number; score: number }> | null,
  limit: number = 10
): HybridSearchResult[] {
  // 1. FTS search
  const ftsEntities = searchEntities(db, query)
  const ftsMap = new Map<number, { entity: Entity; rank: number }>()
  ftsEntities.forEach((e, i) => ftsMap.set(e.id, { entity: e, rank: i + 1 }))

  // 2. Semantic results (pre-computed externally)
  const semMap = new Map<number, number>()
  if (semanticResults) {
    for (const r of semanticResults) {
      semMap.set(r.entityId, r.score)
    }
  }

  // 3. Merge with reciprocal rank fusion
  const allIds = new Set([...ftsMap.keys(), ...semMap.keys()])
  const results: HybridSearchResult[] = []

  for (const id of allIds) {
    const ftsEntry = ftsMap.get(id)
    const ftsScore = ftsEntry ? 1 / (60 + ftsEntry.rank) : 0 // RRF with k=60
    const semanticScore = semMap.get(id) ?? 0

    const entity = ftsEntry?.entity ?? getEntity(db, id)
    if (!entity) continue

    const combinedScore = ftsScore * 0.4 + semanticScore * 0.6
    results.push({ entity, ftsScore, semanticScore, combinedScore })
  }

  results.sort((a, b) => b.combinedScore - a.combinedScore)
  return results.slice(0, limit)
}
