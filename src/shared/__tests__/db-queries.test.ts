import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4 } from '../schema'
import * as q from '../db-queries'

let db: Database.Database

function initTestDb(): Database.Database {
  const d = new Database(':memory:')
  d.exec(SCHEMA_V1)
  d.exec(SCHEMA_V2)
  d.exec(SCHEMA_V3)
  d.exec(SCHEMA_V4)
  return d
}

beforeEach(() => {
  db = initTestDb()
})

afterEach(() => {
  db.close()
})

// ─── Entities ──────────────────────────────────────────────────

describe('createEntity', () => {
  it('creates an entity with default type', () => {
    const entity = q.createEntity(db, 'Test Entity')
    expect(entity.id).toBe(1)
    expect(entity.name).toBe('Test Entity')
    expect(entity.type).toBe('fact')
    expect(entity.category).toBeNull()
  })

  it('creates an entity with custom type and category', () => {
    const entity = q.createEntity(db, 'Alice', 'person', 'contacts')
    expect(entity.name).toBe('Alice')
    expect(entity.type).toBe('person')
    expect(entity.category).toBe('contacts')
  })
})

describe('getEntity', () => {
  it('returns null for non-existent entity', () => {
    expect(q.getEntity(db, 999)).toBeNull()
  })

  it('returns the entity by id', () => {
    const created = q.createEntity(db, 'Test')
    const fetched = q.getEntity(db, created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.name).toBe('Test')
  })
})

describe('listEntities', () => {
  it('returns empty array when no entities exist', () => {
    expect(q.listEntities(db)).toEqual([])
  })

  it('returns all entities ordered by updated_at desc', () => {
    q.createEntity(db, 'A')
    q.createEntity(db, 'B')
    const all = q.listEntities(db)
    expect(all).toHaveLength(2)
  })

  it('filters by category', () => {
    q.createEntity(db, 'A', 'fact', 'work')
    q.createEntity(db, 'B', 'fact', 'personal')
    const work = q.listEntities(db, 'work')
    expect(work).toHaveLength(1)
    expect(work[0].name).toBe('A')
  })
})

describe('updateEntity', () => {
  it('updates entity name', () => {
    const entity = q.createEntity(db, 'Old Name')
    q.updateEntity(db, entity.id, { name: 'New Name' })
    const updated = q.getEntity(db, entity.id)
    expect(updated!.name).toBe('New Name')
  })

  it('does nothing when no fields provided', () => {
    const entity = q.createEntity(db, 'Test')
    q.updateEntity(db, entity.id, {})
    const same = q.getEntity(db, entity.id)
    expect(same!.name).toBe('Test')
  })
})

describe('deleteEntity', () => {
  it('deletes an entity', () => {
    const entity = q.createEntity(db, 'Doomed')
    q.deleteEntity(db, entity.id)
    expect(q.getEntity(db, entity.id)).toBeNull()
  })
})

describe('searchEntities', () => {
  it('finds entities by name LIKE fallback', () => {
    q.createEntity(db, 'Project Alpha')
    q.createEntity(db, 'Project Beta')
    q.createEntity(db, 'Meeting Notes')

    const results = q.searchEntities(db, 'Project')
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty for no match', () => {
    q.createEntity(db, 'Something')
    const results = q.searchEntities(db, 'zzzznotfound')
    expect(results).toHaveLength(0)
  })
})

// ─── Observations ──────────────────────────────────────────────

describe('addObservation', () => {
  it('creates an observation with default source', () => {
    const entity = q.createEntity(db, 'Test')
    const obs = q.addObservation(db, entity.id, 'Something important')
    expect(obs.id).toBe(1)
    expect(obs.content).toBe('Something important')
    expect(obs.source).toBe('claude')
    expect(obs.entity_id).toBe(entity.id)
  })

  it('creates an observation with custom source', () => {
    const entity = q.createEntity(db, 'Test')
    const obs = q.addObservation(db, entity.id, 'Data', 'user')
    expect(obs.source).toBe('user')
  })
})

describe('getObservation', () => {
  it('returns null for non-existent observation', () => {
    expect(q.getObservation(db, 999)).toBeNull()
  })
})

describe('getObservations', () => {
  it('returns all observations for an entity', () => {
    const entity = q.createEntity(db, 'Test')
    q.addObservation(db, entity.id, 'First')
    q.addObservation(db, entity.id, 'Second')
    const obs = q.getObservations(db, entity.id)
    expect(obs).toHaveLength(2)
  })

  it('returns empty array for entity with no observations', () => {
    const entity = q.createEntity(db, 'Test')
    expect(q.getObservations(db, entity.id)).toEqual([])
  })
})

describe('deleteObservation', () => {
  it('deletes an observation', () => {
    const entity = q.createEntity(db, 'Test')
    const obs = q.addObservation(db, entity.id, 'Delete me')
    q.deleteObservation(db, obs.id)
    expect(q.getObservation(db, obs.id)).toBeNull()
  })
})

// ─── Relations ─────────────────────────────────────────────────

describe('addRelation', () => {
  it('creates a relation between two entities', () => {
    const e1 = q.createEntity(db, 'Alice')
    const e2 = q.createEntity(db, 'Bob')
    const rel = q.addRelation(db, e1.id, e2.id, 'knows')
    expect(rel.from_entity).toBe(e1.id)
    expect(rel.to_entity).toBe(e2.id)
    expect(rel.relation_type).toBe('knows')
  })
})

describe('getRelation', () => {
  it('returns null for non-existent relation', () => {
    expect(q.getRelation(db, 999)).toBeNull()
  })
})

describe('getRelations', () => {
  it('returns relations where entity is from or to', () => {
    const e1 = q.createEntity(db, 'A')
    const e2 = q.createEntity(db, 'B')
    const e3 = q.createEntity(db, 'C')
    q.addRelation(db, e1.id, e2.id, 'knows')
    q.addRelation(db, e3.id, e1.id, 'manages')
    const rels = q.getRelations(db, e1.id)
    expect(rels).toHaveLength(2)
  })
})

describe('deleteRelation', () => {
  it('deletes a relation', () => {
    const e1 = q.createEntity(db, 'A')
    const e2 = q.createEntity(db, 'B')
    const rel = q.addRelation(db, e1.id, e2.id, 'test')
    q.deleteRelation(db, rel.id)
    expect(q.getRelation(db, rel.id)).toBeNull()
  })
})

// ─── Stats ─────────────────────────────────────────────────────

describe('getMemoryStats', () => {
  it('returns zero counts for empty db', () => {
    const stats = q.getMemoryStats(db)
    expect(stats.entityCount).toBe(0)
    expect(stats.observationCount).toBe(0)
    expect(stats.relationCount).toBe(0)
  })

  it('returns correct counts', () => {
    const e1 = q.createEntity(db, 'A')
    const e2 = q.createEntity(db, 'B')
    q.addObservation(db, e1.id, 'obs1')
    q.addObservation(db, e2.id, 'obs2')
    q.addRelation(db, e1.id, e2.id, 'related')

    const stats = q.getMemoryStats(db)
    expect(stats.entityCount).toBe(2)
    expect(stats.observationCount).toBe(2)
    expect(stats.relationCount).toBe(1)
  })
})

// ─── Tasks ─────────────────────────────────────────────────────

describe('createTask', () => {
  it('creates a cron task with defaults', () => {
    const task = q.createTask(db, {
      name: 'Test Task',
      prompt: 'Do something',
      cronExpression: '0 9 * * *'
    })
    expect(task.id).toBe(1)
    expect(task.name).toBe('Test Task')
    expect(task.prompt).toBe('Do something')
    expect(task.cronExpression).toBe('0 9 * * *')
    expect(task.triggerType).toBe('cron')
    expect(task.executor).toBe('claude_code')
    expect(task.status).toBe('active')
    expect(task.errorCount).toBe(0)
    expect(task.scheduledAt).toBeNull()
  })

  it('creates a one-time task with scheduledAt', () => {
    const future = new Date(Date.now() + 3600000).toISOString()
    const task = q.createTask(db, {
      name: 'One-time',
      prompt: 'Run once',
      triggerType: 'once',
      scheduledAt: future
    })
    expect(task.triggerType).toBe('once')
    expect(task.scheduledAt).toBe(future)
  })

  it('creates a manual task', () => {
    const task = q.createTask(db, {
      name: 'Manual',
      prompt: 'On demand',
      triggerType: 'manual'
    })
    expect(task.triggerType).toBe('manual')
    expect(task.cronExpression).toBeNull()
    expect(task.scheduledAt).toBeNull()
  })

  it('creates a task with maxRuns', () => {
    const task = q.createTask(db, {
      name: 'Limited',
      prompt: 'Run 3 times',
      triggerType: 'cron',
      cronExpression: '0 9 * * *',
      maxRuns: 3
    })
    expect(task.maxRuns).toBe(3)
    expect(task.runCount).toBe(0)
  })

  it('creates a task without maxRuns (unlimited)', () => {
    const task = q.createTask(db, {
      name: 'Unlimited',
      prompt: 'Run forever'
    })
    expect(task.maxRuns).toBeNull()
    expect(task.runCount).toBe(0)
  })
})

describe('getTask', () => {
  it('returns null for non-existent task', () => {
    expect(q.getTask(db, 999)).toBeNull()
  })

  it('maps all fields correctly', () => {
    q.createTask(db, {
      name: 'Full Task',
      description: 'A description',
      prompt: 'Run it',
      cronExpression: '*/5 * * * *',
      triggerType: 'cron',
      executor: 'claude_code'
    })
    const task = q.getTask(db, 1)!
    expect(task.name).toBe('Full Task')
    expect(task.description).toBe('A description')
    expect(task.cronExpression).toBe('*/5 * * * *')
    expect(task.triggerType).toBe('cron')
    expect(task.executor).toBe('claude_code')
    expect(task.createdAt).toBeTruthy()
    expect(task.updatedAt).toBeTruthy()
  })
})

describe('listTasks', () => {
  it('lists all tasks', () => {
    q.createTask(db, { name: 'A', prompt: 'p' })
    q.createTask(db, { name: 'B', prompt: 'p' })
    expect(q.listTasks(db)).toHaveLength(2)
  })

  it('filters by status', () => {
    q.createTask(db, { name: 'A', prompt: 'p' })
    const b = q.createTask(db, { name: 'B', prompt: 'p' })
    q.pauseTask(db, b.id)
    expect(q.listTasks(db, 'active')).toHaveLength(1)
    expect(q.listTasks(db, 'paused')).toHaveLength(1)
  })
})

describe('updateTask', () => {
  it('updates multiple fields', () => {
    const task = q.createTask(db, { name: 'Old', prompt: 'p' })
    q.updateTask(db, task.id, { name: 'New', status: 'paused' })
    const updated = q.getTask(db, task.id)!
    expect(updated.name).toBe('New')
    expect(updated.status).toBe('paused')
  })

  it('updates scheduledAt', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p', triggerType: 'once' })
    const future = new Date(Date.now() + 7200000).toISOString()
    q.updateTask(db, task.id, { scheduledAt: future })
    expect(q.getTask(db, task.id)!.scheduledAt).toBe(future)
  })

  it('does nothing when no updates', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    q.updateTask(db, task.id, {})
    expect(q.getTask(db, task.id)!.name).toBe('T')
  })

  it('updates runCount', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p', maxRuns: 5 })
    q.updateTask(db, task.id, { runCount: 3 })
    expect(q.getTask(db, task.id)!.runCount).toBe(3)
  })

  it('updates maxRuns', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    q.updateTask(db, task.id, { maxRuns: 10 })
    expect(q.getTask(db, task.id)!.maxRuns).toBe(10)
  })
})

describe('deleteTask', () => {
  it('deletes a task', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    q.deleteTask(db, task.id)
    expect(q.getTask(db, task.id)).toBeNull()
  })
})

describe('pauseTask / resumeTask', () => {
  it('pauses and resumes a task', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    q.pauseTask(db, task.id)
    expect(q.getTask(db, task.id)!.status).toBe('paused')
    q.resumeTask(db, task.id)
    expect(q.getTask(db, task.id)!.status).toBe('active')
  })
})

// ─── Task Runs ─────────────────────────────────────────────────

describe('createTaskRun', () => {
  it('creates a running task run', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    const run = q.createTaskRun(db, task.id)
    expect(run.taskId).toBe(task.id)
    expect(run.status).toBe('running')
    expect(run.startedAt).toBeTruthy()
    expect(run.finishedAt).toBeNull()
    expect(run.progress).toBeNull()
    expect(run.progressMessage).toBeNull()
  })
})

describe('completeTaskRun', () => {
  it('completes a task run successfully', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    const run = q.createTaskRun(db, task.id)
    q.completeTaskRun(db, run.id, 'Success output')
    const completed = q.getTaskRun(db, run.id)!
    expect(completed.status).toBe('completed')
    expect(completed.result).toBe('Success output')
    expect(completed.finishedAt).toBeTruthy()
    expect(completed.durationMs).toBeDefined()
    expect(completed.errorMessage).toBeNull()
  })

  it('completes a task run with error', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    const run = q.createTaskRun(db, task.id)
    q.completeTaskRun(db, run.id, 'output', undefined, 'Something went wrong')
    const completed = q.getTaskRun(db, run.id)!
    expect(completed.status).toBe('failed')
    expect(completed.errorMessage).toBe('Something went wrong')

    // Error count should be incremented on the task
    const updatedTask = q.getTask(db, task.id)!
    expect(updatedTask.errorCount).toBe(1)
  })

  it('resets error count on success', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })

    // Fail first
    const run1 = q.createTaskRun(db, task.id)
    q.completeTaskRun(db, run1.id, '', undefined, 'error')
    expect(q.getTask(db, task.id)!.errorCount).toBe(1)

    // Succeed next
    const run2 = q.createTaskRun(db, task.id)
    q.completeTaskRun(db, run2.id, 'ok')
    expect(q.getTask(db, task.id)!.errorCount).toBe(0)
  })

  it('does nothing for non-existent run', () => {
    q.completeTaskRun(db, 999, 'output')
    // Should not throw
  })
})

describe('getTaskRuns', () => {
  it('returns runs for a task, ordered by started_at desc', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    q.createTaskRun(db, task.id)
    q.createTaskRun(db, task.id)
    q.createTaskRun(db, task.id)
    const runs = q.getTaskRuns(db, task.id)
    expect(runs).toHaveLength(3)
  })

  it('respects limit', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    for (let i = 0; i < 5; i++) q.createTaskRun(db, task.id)
    expect(q.getTaskRuns(db, task.id, 2)).toHaveLength(2)
  })
})

describe('listAllRuns', () => {
  it('lists runs across all tasks', () => {
    const t1 = q.createTask(db, { name: 'T1', prompt: 'p' })
    const t2 = q.createTask(db, { name: 'T2', prompt: 'p' })
    q.createTaskRun(db, t1.id)
    q.createTaskRun(db, t2.id)
    expect(q.listAllRuns(db, 10)).toHaveLength(2)
  })
})

describe('getLatestTaskRun', () => {
  it('returns null when no runs exist', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    expect(q.getLatestTaskRun(db, task.id)).toBeNull()
  })

  it('returns a run when runs exist', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    q.createTaskRun(db, task.id)
    q.createTaskRun(db, task.id)
    const result = q.getLatestTaskRun(db, task.id)
    expect(result).not.toBeNull()
    expect(result!.taskId).toBe(task.id)
  })
})

// ─── One-Time & Progress Queries ───────────────────────────────

describe('getDueOnceTasks', () => {
  it('returns empty when no one-time tasks exist', () => {
    expect(q.getDueOnceTasks(db)).toEqual([])
  })

  it('returns tasks where scheduled_at is in the past', () => {
    // Use SQLite-compatible datetime format (no T, no Z)
    const past = new Date(Date.now() - 120000).toISOString().replace('T', ' ').replace('Z', '')
    q.createTask(db, {
      name: 'Due Task',
      prompt: 'run me',
      triggerType: 'once',
      scheduledAt: past
    })
    const due = q.getDueOnceTasks(db)
    expect(due).toHaveLength(1)
    expect(due[0].name).toBe('Due Task')
  })

  it('does not return future one-time tasks', () => {
    const future = new Date(Date.now() + 3600000).toISOString().replace('T', ' ').replace('Z', '')
    q.createTask(db, {
      name: 'Future Task',
      prompt: 'not yet',
      triggerType: 'once',
      scheduledAt: future
    })
    expect(q.getDueOnceTasks(db)).toHaveLength(0)
  })

  it('does not return paused one-time tasks', () => {
    const past = new Date(Date.now() - 120000).toISOString().replace('T', ' ').replace('Z', '')
    const task = q.createTask(db, {
      name: 'Paused One-Time',
      prompt: 'paused',
      triggerType: 'once',
      scheduledAt: past
    })
    q.pauseTask(db, task.id)
    expect(q.getDueOnceTasks(db)).toHaveLength(0)
  })

  it('does not return completed one-time tasks', () => {
    const past = new Date(Date.now() - 120000).toISOString().replace('T', ' ').replace('Z', '')
    const task = q.createTask(db, {
      name: 'Done',
      prompt: 'done',
      triggerType: 'once',
      scheduledAt: past
    })
    q.updateTask(db, task.id, { status: 'completed' })
    expect(q.getDueOnceTasks(db)).toHaveLength(0)
  })

  it('does not return cron tasks', () => {
    q.createTask(db, {
      name: 'Cron Task',
      prompt: 'cron',
      triggerType: 'cron',
      cronExpression: '* * * * *'
    })
    expect(q.getDueOnceTasks(db)).toHaveLength(0)
  })
})

describe('updateTaskRunProgress', () => {
  it('updates progress and message on a task run', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    const run = q.createTaskRun(db, task.id)
    q.updateTaskRunProgress(db, run.id, 0.5, 'Step 2: Using Bash...')
    const updated = q.getTaskRun(db, run.id)!
    expect(updated.progress).toBe(0.5)
    expect(updated.progressMessage).toBe('Step 2: Using Bash...')
  })

  it('handles null progress (indeterminate)', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    const run = q.createTaskRun(db, task.id)
    q.updateTaskRunProgress(db, run.id, null, 'Working...')
    const updated = q.getTaskRun(db, run.id)!
    expect(updated.progress).toBeNull()
    expect(updated.progressMessage).toBe('Working...')
  })
})

describe('getRunningTaskRuns', () => {
  it('returns empty when no running runs', () => {
    expect(q.getRunningTaskRuns(db)).toEqual([])
  })

  it('returns only running task runs', () => {
    const task = q.createTask(db, { name: 'T', prompt: 'p' })
    const run1 = q.createTaskRun(db, task.id) // running
    const run2 = q.createTaskRun(db, task.id) // running
    q.completeTaskRun(db, run1.id, 'done')    // now completed

    const running = q.getRunningTaskRuns(db)
    expect(running).toHaveLength(1)
    expect(running[0].id).toBe(run2.id)
  })
})

// ─── Schema Migration ──────────────────────────────────────────

describe('schema migration', () => {
  it('V1 creates all required tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const tableNames = tables.map((t) => t.name)
    expect(tableNames).toContain('entities')
    expect(tableNames).toContain('observations')
    expect(tableNames).toContain('relations')
    expect(tableNames).toContain('tasks')
    expect(tableNames).toContain('task_runs')
    expect(tableNames).toContain('watches')
    expect(tableNames).toContain('settings')
    expect(tableNames).toContain('schema_version')
  })

  it('V3 adds max_runs and run_count columns to tasks', () => {
    const columns = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('max_runs')
    expect(colNames).toContain('run_count')
  })

  it('V2 adds scheduled_at column to tasks', () => {
    const columns = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('scheduled_at')
  })

  it('V2 adds progress columns to task_runs', () => {
    const columns = db.prepare('PRAGMA table_info(task_runs)').all() as { name: string }[]
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('progress')
    expect(colNames).toContain('progress_message')
  })

  it('V4 adds memory_entity_id column to tasks', () => {
    const columns = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('memory_entity_id')
  })

  it('schema_version table has versions 1, 2, 3, and 4', () => {
    const versions = db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as { version: number }[]
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3, 4])
  })
})

// ─── Memory-Task Integration ────────────────────────────────────

describe('getTaskMemoryContext', () => {
  it('returns null when task has no memory entity', () => {
    const task = q.createTask(db, { name: 'No Memory', prompt: 'p' })
    expect(q.getTaskMemoryContext(db, task.id)).toBeNull()
  })

  it('returns null when memory entity has no observations', () => {
    const task = q.createTask(db, { name: 'Empty Memory', prompt: 'p' })
    const entity = q.createEntity(db, 'Task: Empty Memory', 'task_result', 'task')
    q.updateTask(db, task.id, { memoryEntityId: entity.id })
    expect(q.getTaskMemoryContext(db, task.id)).toBeNull()
  })

  it('returns formatted context with recent observations', () => {
    const task = q.createTask(db, { name: 'With Memory', prompt: 'p' })
    const entity = q.createEntity(db, 'Task: With Memory', 'task_result', 'task')
    q.updateTask(db, task.id, { memoryEntityId: entity.id })
    q.addObservation(db, entity.id, '[SUCCESS] First result', 'task_runner')
    q.addObservation(db, entity.id, '[SUCCESS] Second result', 'task_runner')

    const context = q.getTaskMemoryContext(db, task.id)
    expect(context).not.toBeNull()
    expect(context).toContain('Your previous results')
    expect(context).toContain('First result')
    expect(context).toContain('Second result')
  })

  it('limits own observations to 5', () => {
    const task = q.createTask(db, { name: 'Many Results', prompt: 'p' })
    const entity = q.createEntity(db, 'Task: Many Results', 'task_result', 'task')
    q.updateTask(db, task.id, { memoryEntityId: entity.id })
    for (let i = 0; i < 8; i++) {
      q.addObservation(db, entity.id, `[SUCCESS] Result ${i}`, 'task_runner')
    }

    const context = q.getTaskMemoryContext(db, task.id)!
    // Most recent 5 should be present (7,6,5,4,3), oldest (0,1,2) should not
    expect(context).toContain('Result 7')
    expect(context).toContain('Result 3')
    expect(context).not.toContain('Result 2')
  })

  it('includes related knowledge from other entities', () => {
    // Create a user memory about "HN"
    const userEntity = q.createEntity(db, 'HN Preferences', 'preference', 'personal')
    q.addObservation(db, userEntity.id, 'User prefers AI and startup stories', 'claude')

    // Create a task named "HN Digest"
    const task = q.createTask(db, { name: 'HN Digest', prompt: 'Fetch HN stories' })

    const context = q.getTaskMemoryContext(db, task.id)
    expect(context).not.toBeNull()
    expect(context).toContain('Related knowledge')
    expect(context).toContain('HN Preferences')
    expect(context).toContain('AI and startup stories')
  })

  it('includes results from other tasks in related knowledge', () => {
    // Create another task with results
    const otherTask = q.createTask(db, { name: 'Tech News Tracker', prompt: 'p' })
    const otherEntity = q.createEntity(db, 'Task: Tech News Tracker', 'task_result', 'task')
    q.updateTask(db, otherTask.id, { memoryEntityId: otherEntity.id })
    q.addObservation(db, otherEntity.id, '[SUCCESS] Top story: AI breakthrough', 'task_runner')

    // Create a task that should find "Tech News" as related
    const task = q.createTask(db, { name: 'Tech News Summary', prompt: 'Summarize tech news' })

    const context = q.getTaskMemoryContext(db, task.id)
    // Should find the other task's results as related knowledge
    expect(context).not.toBeNull()
    expect(context).toContain('Related knowledge')
    expect(context).toContain('Tech News Tracker')
  })

  it('returns null for non-existent task', () => {
    expect(q.getTaskMemoryContext(db, 999)).toBeNull()
  })
})

describe('ensureTaskMemoryEntity', () => {
  it('creates a new entity on first call', () => {
    const task = q.createTask(db, { name: 'New Task', prompt: 'p' })
    const entityId = q.ensureTaskMemoryEntity(db, task.id)

    const entity = q.getEntity(db, entityId)
    expect(entity).not.toBeNull()
    expect(entity!.name).toBe('Task: New Task')
    expect(entity!.type).toBe('task_result')
    expect(entity!.category).toBe('task')

    // Task should be linked
    const updated = q.getTask(db, task.id)!
    expect(updated.memoryEntityId).toBe(entityId)
  })

  it('reuses existing entity on subsequent calls', () => {
    const task = q.createTask(db, { name: 'Stable Task', prompt: 'p' })
    const id1 = q.ensureTaskMemoryEntity(db, task.id)
    const id2 = q.ensureTaskMemoryEntity(db, task.id)
    expect(id1).toBe(id2)
  })

  it('creates new entity if linked entity was deleted', () => {
    const task = q.createTask(db, { name: 'Broken Link', prompt: 'p' })
    const id1 = q.ensureTaskMemoryEntity(db, task.id)
    q.deleteEntity(db, id1) // simulate entity deletion

    const id2 = q.ensureTaskMemoryEntity(db, task.id)
    expect(id2).not.toBe(id1)

    const entity = q.getEntity(db, id2)
    expect(entity!.name).toBe('Task: Broken Link')
  })

  it('throws for non-existent task', () => {
    expect(() => q.ensureTaskMemoryEntity(db, 999)).toThrow('not found')
  })
})

describe('storeTaskResultInMemory', () => {
  it('stores successful result as observation', () => {
    const task = q.createTask(db, { name: 'Store Test', prompt: 'p' })
    q.storeTaskResultInMemory(db, task.id, 'Task output here', true)

    const updated = q.getTask(db, task.id)!
    expect(updated.memoryEntityId).not.toBeNull()

    const obs = q.getObservations(db, updated.memoryEntityId!)
    expect(obs).toHaveLength(1)
    expect(obs[0].content).toContain('[SUCCESS]')
    expect(obs[0].content).toContain('Task output here')
    expect(obs[0].source).toBe('task_runner')
  })

  it('stores failed result with FAILED prefix', () => {
    const task = q.createTask(db, { name: 'Fail Test', prompt: 'p' })
    q.storeTaskResultInMemory(db, task.id, 'Error output', false)

    const updated = q.getTask(db, task.id)!
    const obs = q.getObservations(db, updated.memoryEntityId!)
    expect(obs[0].content).toContain('[FAILED]')
  })

  it('truncates long results', () => {
    const task = q.createTask(db, { name: 'Long Result', prompt: 'p' })
    const longOutput = 'x'.repeat(3000)
    q.storeTaskResultInMemory(db, task.id, longOutput, true)

    const updated = q.getTask(db, task.id)!
    const obs = q.getObservations(db, updated.memoryEntityId!)
    expect(obs[0].content.length).toBeLessThan(2100) // ~2000 + prefix + truncation marker
    expect(obs[0].content).toContain('[...truncated]')
  })

  it('prunes old observations beyond limit', () => {
    const task = q.createTask(db, { name: 'Prune Test', prompt: 'p' })
    for (let i = 0; i < 15; i++) {
      q.storeTaskResultInMemory(db, task.id, `Result ${i}`, true)
    }

    const updated = q.getTask(db, task.id)!
    const obs = q.getObservations(db, updated.memoryEntityId!)
    expect(obs.length).toBe(10) // pruned to MAX_OBSERVATIONS_PER_ENTITY
  })
})

describe('incrementRunCount', () => {
  it('increments run count', () => {
    const task = q.createTask(db, { name: 'Counter', prompt: 'p' })
    expect(q.getTask(db, task.id)!.runCount).toBe(0)

    q.incrementRunCount(db, task.id)
    expect(q.getTask(db, task.id)!.runCount).toBe(1)

    q.incrementRunCount(db, task.id)
    expect(q.getTask(db, task.id)!.runCount).toBe(2)
  })

  it('auto-completes task when maxRuns reached', () => {
    const task = q.createTask(db, { name: 'Limited', prompt: 'p', maxRuns: 2 })

    q.incrementRunCount(db, task.id)
    expect(q.getTask(db, task.id)!.status).toBe('active')

    q.incrementRunCount(db, task.id)
    expect(q.getTask(db, task.id)!.status).toBe('completed')
  })

  it('does not auto-complete when maxRuns is null', () => {
    const task = q.createTask(db, { name: 'Unlimited', prompt: 'p' })

    for (let i = 0; i < 100; i++) {
      q.incrementRunCount(db, task.id)
    }
    expect(q.getTask(db, task.id)!.status).toBe('active')
    expect(q.getTask(db, task.id)!.runCount).toBe(100)
  })
})
