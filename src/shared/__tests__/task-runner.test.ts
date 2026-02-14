import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2 } from '../schema'
import * as queries from '../db-queries'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'

// Mock executeClaudeCode before importing task-runner
vi.mock('../claude-code', () => ({
  executeClaudeCode: vi.fn()
}))

import { executeTask, isTaskRunning } from '../task-runner'
import { executeClaudeCode } from '../claude-code'

const mockExecute = vi.mocked(executeClaudeCode)

let db: Database.Database
let resultsDir: string

function initTestDb(): Database.Database {
  const d = new Database(':memory:')
  d.exec(SCHEMA_V1)
  d.exec(SCHEMA_V2)
  return d
}

function createActiveTask(name = 'Test Task', prompt = 'Do something'): number {
  const task = queries.createTask(db, {
    name,
    prompt,
    triggerType: 'manual',
    executor: 'claude_code'
  })
  return task.id
}

beforeEach(() => {
  db = initTestDb()
  resultsDir = mkdtempSync(join(tmpdir(), 'daymon-test-'))
  mockExecute.mockReset()
})

afterEach(() => {
  db.close()
  if (existsSync(resultsDir)) {
    rmSync(resultsDir, { recursive: true })
  }
})

// ─── Task Not Found ─────────────────────────────────────────────

describe('executeTask - task not found', () => {
  it('returns error for non-existent task', async () => {
    const result = await executeTask(999, { db, resultsDir })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/not found/)
  })
})

// ─── Task Status Checks ────────────────────────────────────────

describe('executeTask - status checks', () => {
  it('returns error for paused task', async () => {
    const id = createActiveTask()
    queries.pauseTask(db, id)

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/paused/)
  })

  it('returns error for completed task', async () => {
    const id = createActiveTask()
    queries.updateTask(db, id, { status: 'completed' })

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/completed/)
  })
})

// ─── Cross-Process Safety ──────────────────────────────────────

describe('executeTask - cross-process concurrency', () => {
  it('rejects when another process has a running TaskRun', async () => {
    const id = createActiveTask()
    // Simulate another process having started this task
    queries.createTaskRun(db, id) // status='running' by default

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toMatch(/running execution/)
  })
})

// ─── Successful Execution ──────────────────────────────────────

describe('executeTask - success', () => {
  it('executes task and returns output', async () => {
    const id = createActiveTask('My Task', 'Say hello')
    mockExecute.mockResolvedValue({
      stdout: 'Hello world',
      stderr: '',
      exitCode: 0,
      durationMs: 1234,
      timedOut: false
    })

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(true)
    expect(result.output).toBe('Hello world')
    expect(result.durationMs).toBe(1234)
    expect(mockExecute).toHaveBeenCalledWith('Say hello', undefined, expect.any(Function))
  })

  it('creates a TaskRun record', async () => {
    const id = createActiveTask()
    mockExecute.mockResolvedValue({
      stdout: 'Done',
      stderr: '',
      exitCode: 0,
      durationMs: 500,
      timedOut: false
    })

    await executeTask(id, { db, resultsDir })

    const runs = queries.getTaskRuns(db, id, 10)
    expect(runs.length).toBe(1)
    expect(runs[0].status).toBe('completed')
    expect(runs[0].result).toBe('Done')
  })

  it('saves result to markdown file', async () => {
    const id = createActiveTask('File Task')
    mockExecute.mockResolvedValue({
      stdout: 'File output',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
      timedOut: false
    })

    const result = await executeTask(id, { db, resultsDir })
    expect(result.resultFilePath).toBeDefined()
    expect(existsSync(result.resultFilePath!)).toBe(true)

    const content = readFileSync(result.resultFilePath!, 'utf-8')
    expect(content).toContain('# Task: File Task')
    expect(content).toContain('File output')
    expect(content).toContain('Success')
  })

  it('calls onComplete callback', async () => {
    const id = createActiveTask()
    mockExecute.mockResolvedValue({
      stdout: 'Result text here',
      stderr: '',
      exitCode: 0,
      durationMs: 200,
      timedOut: false
    })

    const onComplete = vi.fn()
    await executeTask(id, { db, resultsDir, onComplete })
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete.mock.calls[0][0].name).toBe('Test Task')
    expect(onComplete.mock.calls[0][1]).toBe('Result text here')
  })
})

// ─── Failed Execution ──────────────────────────────────────────

describe('executeTask - failure', () => {
  it('handles non-zero exit code', async () => {
    const id = createActiveTask()
    mockExecute.mockResolvedValue({
      stdout: '',
      stderr: 'Something broke',
      exitCode: 1,
      durationMs: 300,
      timedOut: false
    })

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toContain('Exit code 1')
    expect(result.errorMessage).toContain('Something broke')
  })

  it('handles timeout', async () => {
    const id = createActiveTask()
    mockExecute.mockResolvedValue({
      stdout: 'Partial output',
      stderr: '',
      exitCode: 1,
      durationMs: 300000,
      timedOut: true
    })

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toContain('Timed out')
  })

  it('records error in TaskRun', async () => {
    const id = createActiveTask()
    mockExecute.mockResolvedValue({
      stdout: '',
      stderr: 'crash',
      exitCode: 2,
      durationMs: 50,
      timedOut: false
    })

    await executeTask(id, { db, resultsDir })

    const runs = queries.getTaskRuns(db, id, 10)
    expect(runs[0].status).toBe('failed')
    expect(runs[0].errorMessage).toContain('Exit code 2')
  })

  it('calls onFailed callback', async () => {
    const id = createActiveTask()
    mockExecute.mockResolvedValue({
      stdout: '',
      stderr: 'error',
      exitCode: 1,
      durationMs: 100,
      timedOut: false
    })

    const onFailed = vi.fn()
    await executeTask(id, { db, resultsDir, onFailed })
    expect(onFailed).toHaveBeenCalledOnce()
    expect(onFailed.mock.calls[0][1]).toContain('Exit code 1')
  })

  it('handles executor exception', async () => {
    const id = createActiveTask()
    mockExecute.mockRejectedValue(new Error('spawn failed'))

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(false)
    expect(result.errorMessage).toBe('spawn failed')

    const runs = queries.getTaskRuns(db, id, 10)
    expect(runs[0].status).toBe('failed')
    expect(runs[0].errorMessage).toBe('spawn failed')
  })
})

// ─── isTaskRunning ─────────────────────────────────────────────

describe('isTaskRunning', () => {
  it('returns false when no task is running', () => {
    expect(isTaskRunning(42)).toBe(false)
  })
})

// ─── Result File ───────────────────────────────────────────────

describe('result file', () => {
  it('creates results directory if it does not exist', async () => {
    const id = createActiveTask()
    const nestedDir = join(resultsDir, 'nested', 'deep')
    mockExecute.mockResolvedValue({
      stdout: 'output',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
      timedOut: false
    })

    await executeTask(id, { db, resultsDir: nestedDir })
    expect(existsSync(nestedDir)).toBe(true)
  })

  it('saves timed-out status in result file', async () => {
    const id = createActiveTask('Timeout Task')
    mockExecute.mockResolvedValue({
      stdout: 'partial',
      stderr: '',
      exitCode: 1,
      durationMs: 300000,
      timedOut: true
    })

    const result = await executeTask(id, { db, resultsDir })
    const content = readFileSync(result.resultFilePath!, 'utf-8')
    expect(content).toContain('Timed Out')
  })

  it('saves failed status in result file', async () => {
    const id = createActiveTask('Fail Task')
    mockExecute.mockResolvedValue({
      stdout: '',
      stderr: 'error',
      exitCode: 2,
      durationMs: 50,
      timedOut: false
    })

    const result = await executeTask(id, { db, resultsDir })
    const content = readFileSync(result.resultFilePath!, 'utf-8')
    expect(content).toContain('Failed (exit 2)')
  })
})
