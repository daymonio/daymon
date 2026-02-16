import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initTestDb } from '../../shared/__tests__/helpers/test-db'

// Mock node-cron
const mockSchedule = vi.fn().mockReturnValue({ stop: vi.fn() })
const mockValidate = vi.fn().mockReturnValue(true)
vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
    validate: (...args: unknown[]) => mockValidate(...args)
  }
}))

// Mock task execution
vi.mock('../../shared/task-runner', () => ({
  executeTask: vi.fn().mockResolvedValue({ success: true, output: 'ok', durationMs: 1000 })
}))

// Mock embedding modules
vi.mock('../../shared/embedding-indexer', () => ({
  indexPendingEmbeddings: vi.fn().mockResolvedValue(0)
}))
vi.mock('../../shared/embeddings', () => ({
  initEngine: vi.fn().mockResolvedValue(undefined)
}))

// Mock notifications
vi.mock('../notifications', () => ({
  notifyTaskComplete: vi.fn(),
  notifyTaskFailed: vi.fn()
}))

import { startScheduler, stopScheduler, syncNow, getSchedulerStatus } from '../scheduler'

let db: Database.Database

beforeEach(() => {
  db = initTestDb()
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  stopScheduler()
  vi.useRealTimers()
  db.close()
})

function createTask(overrides: Record<string, unknown> = {}): number {
  const defaults = {
    name: 'Test Cron',
    prompt: 'echo test',
    trigger_type: 'cron',
    cron_expression: '*/5 * * * *',
    status: 'active',
    trigger_config: '{"source":"daymon"}',
    created_at: "datetime('now','localtime')",
    updated_at: "datetime('now','localtime')"
  }
  const merged = { ...defaults, ...overrides }
  const result = db.prepare(`
    INSERT INTO tasks (name, prompt, trigger_type, cron_expression, status, trigger_config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
  `).run(merged.name, merged.prompt, merged.trigger_type, merged.cron_expression, merged.status, merged.trigger_config)
  return Number(result.lastInsertRowid)
}

describe('scheduler', () => {
  it('starts and reports running status', () => {
    startScheduler(db, '/tmp/results')
    const status = getSchedulerStatus()
    expect(status.running).toBe(true)
  })

  it('stops and reports stopped status', () => {
    startScheduler(db, '/tmp/results')
    stopScheduler()
    const status = getSchedulerStatus()
    expect(status.running).toBe(false)
    expect(status.jobCount).toBe(0)
  })

  it('schedules active cron tasks', () => {
    createTask({ name: 'Cron A', cron_expression: '0 * * * *' })
    createTask({ name: 'Cron B', cron_expression: '*/10 * * * *' })

    startScheduler(db, '/tmp/results')
    const status = getSchedulerStatus()

    expect(status.jobCount).toBe(2)
    expect(mockSchedule).toHaveBeenCalledTimes(2)
  })

  it('ignores paused tasks', () => {
    createTask({ name: 'Active', status: 'active' })
    createTask({ name: 'Paused', status: 'paused' })

    startScheduler(db, '/tmp/results')
    expect(getSchedulerStatus().jobCount).toBe(1)
  })

  it('ignores manual tasks', () => {
    createTask({ name: 'Manual', trigger_type: 'manual', cron_expression: null })

    startScheduler(db, '/tmp/results')
    expect(getSchedulerStatus().jobCount).toBe(0)
  })

  it('ignores tasks with invalid cron expression', () => {
    mockValidate.mockReturnValueOnce(false)
    createTask({ name: 'Bad Cron', cron_expression: 'not-a-cron' })

    startScheduler(db, '/tmp/results')
    expect(getSchedulerStatus().jobCount).toBe(0)
  })

  it('syncs new tasks after syncNow', () => {
    startScheduler(db, '/tmp/results')
    expect(getSchedulerStatus().jobCount).toBe(0)

    createTask({ name: 'New Cron' })
    syncNow('/tmp/results')

    expect(getSchedulerStatus().jobCount).toBe(1)
  })

  it('removes jobs for deleted tasks on sync', () => {
    const taskId = createTask({ name: 'Will Delete' })
    startScheduler(db, '/tmp/results')
    expect(getSchedulerStatus().jobCount).toBe(1)

    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
    syncNow('/tmp/results')

    expect(getSchedulerStatus().jobCount).toBe(0)
  })

  it('removes jobs for paused tasks on sync', () => {
    const taskId = createTask({ name: 'Will Pause' })
    startScheduler(db, '/tmp/results')
    expect(getSchedulerStatus().jobCount).toBe(1)

    db.prepare("UPDATE tasks SET status = 'paused' WHERE id = ?").run(taskId)
    syncNow('/tmp/results')

    expect(getSchedulerStatus().jobCount).toBe(0)
  })
})
