import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6 } from '../schema'
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
  d.exec(SCHEMA_V3)
  d.exec(SCHEMA_V4)
  d.exec(SCHEMA_V5)
  d.exec(SCHEMA_V6)
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
      timedOut: false,
      sessionId: null
    })

    const result = await executeTask(id, { db, resultsDir })
    expect(result.success).toBe(true)
    expect(result.output).toBe('Hello world')
    expect(result.durationMs).toBe(1234)
    expect(mockExecute).toHaveBeenCalledWith('Say hello', expect.objectContaining({
      onProgress: expect.any(Function)
    }))
  })

  it('creates a TaskRun record', async () => {
    const id = createActiveTask()
    mockExecute.mockResolvedValue({
      stdout: 'Done',
      stderr: '',
      exitCode: 0,
      durationMs: 500,
      timedOut: false,
      sessionId: null
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
      timedOut: false,
      sessionId: null
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
      timedOut: false,
      sessionId: null
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
      timedOut: false,
      sessionId: null
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
      timedOut: true,
      sessionId: null
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
      timedOut: false,
      sessionId: null
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
      timedOut: false,
      sessionId: null
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

// ─── maxRuns Auto-Complete ─────────────────────────────────────

describe('executeTask - maxRuns', () => {
  it('increments runCount on successful execution', async () => {
    const task = queries.createTask(db, {
      name: 'Counted',
      prompt: 'count me',
      triggerType: 'manual',
      maxRuns: 5
    })
    mockExecute.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
      timedOut: false,
      sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })
    expect(queries.getTask(db, task.id)!.runCount).toBe(1)
    expect(queries.getTask(db, task.id)!.status).toBe('active')
  })

  it('auto-completes task when maxRuns is reached', async () => {
    const task = queries.createTask(db, {
      name: 'Limited',
      prompt: 'run me',
      triggerType: 'cron',
      cronExpression: '0 9 * * *',
      maxRuns: 2
    })
    mockExecute.mockResolvedValue({
      stdout: 'done',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
      timedOut: false,
      sessionId: null
    })

    // First run
    await executeTask(task.id, { db, resultsDir })
    expect(queries.getTask(db, task.id)!.runCount).toBe(1)
    expect(queries.getTask(db, task.id)!.status).toBe('active')

    // Second run — should trigger auto-complete
    await executeTask(task.id, { db, resultsDir })
    expect(queries.getTask(db, task.id)!.runCount).toBe(2)
    expect(queries.getTask(db, task.id)!.status).toBe('completed')
  })

  it('does not increment runCount on failed execution', async () => {
    const task = queries.createTask(db, {
      name: 'Fail Counter',
      prompt: 'fail me',
      triggerType: 'manual',
      maxRuns: 3
    })
    mockExecute.mockResolvedValue({
      stdout: '',
      stderr: 'error',
      exitCode: 1,
      durationMs: 50,
      timedOut: false,
      sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })
    expect(queries.getTask(db, task.id)!.runCount).toBe(0)
    expect(queries.getTask(db, task.id)!.status).toBe('active')
  })

  it('does not auto-complete when maxRuns is null (unlimited)', async () => {
    const task = queries.createTask(db, {
      name: 'Unlimited',
      prompt: 'run forever',
      triggerType: 'manual'
    })
    mockExecute.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
      durationMs: 100,
      timedOut: false,
      sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })
    await executeTask(task.id, { db, resultsDir })
    await executeTask(task.id, { db, resultsDir })
    expect(queries.getTask(db, task.id)!.runCount).toBe(3)
    expect(queries.getTask(db, task.id)!.status).toBe('active')
  })

  it('auto-completes with maxRuns=1 after a single run', async () => {
    const task = queries.createTask(db, {
      name: 'One Shot',
      prompt: 'once',
      triggerType: 'manual',
      maxRuns: 1
    })
    mockExecute.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
      durationMs: 50,
      timedOut: false,
      sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })
    expect(queries.getTask(db, task.id)!.runCount).toBe(1)
    expect(queries.getTask(db, task.id)!.status).toBe('completed')
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
      timedOut: false,
      sessionId: null
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
      timedOut: true,
      sessionId: null
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
      timedOut: false,
      sessionId: null
    })

    const result = await executeTask(id, { db, resultsDir })
    const content = readFileSync(result.resultFilePath!, 'utf-8')
    expect(content).toContain('Failed (exit 2)')
  })
})

// ─── Memory Integration ───────────────────────────────────────

describe('executeTask - memory integration', () => {
  it('injects memory context into prompt', async () => {
    const task = queries.createTask(db, {
      name: 'Memory Task',
      prompt: 'What is new today?',
      triggerType: 'manual',
      executor: 'claude_code'
    })
    // Pre-populate memory
    const entity = queries.createEntity(db, 'Task: Memory Task', 'task_result', 'task')
    queries.updateTask(db, task.id, { memoryEntityId: entity.id })
    queries.addObservation(db, entity.id, '[SUCCESS] Previous result data', 'task_runner')

    mockExecute.mockResolvedValue({
      stdout: 'New output', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })

    // Verify the prompt passed to Claude includes memory context
    const calledPrompt = mockExecute.mock.calls[0][0]
    expect(calledPrompt).toContain('Your previous results')
    expect(calledPrompt).toContain('Previous result data')
    expect(calledPrompt).toContain('What is new today?')
  })

  it('stores result in memory after successful execution', async () => {
    const id = createActiveTask('Store Result Task', 'Do work')
    mockExecute.mockResolvedValue({
      stdout: 'Task output for memory', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(id, { db, resultsDir })

    const task = queries.getTask(db, id)!
    expect(task.memoryEntityId).not.toBeNull()
    const obs = queries.getObservations(db, task.memoryEntityId!)
    expect(obs.length).toBe(1)
    expect(obs[0].content).toContain('[SUCCESS]')
    expect(obs[0].content).toContain('Task output for memory')
  })

  it('stores failure in memory after failed execution', async () => {
    const id = createActiveTask('Fail Memory Task', 'Try something')
    mockExecute.mockResolvedValue({
      stdout: '', stderr: 'error output', exitCode: 1, durationMs: 50, timedOut: false, sessionId: null
    })

    await executeTask(id, { db, resultsDir })

    const task = queries.getTask(db, id)!
    expect(task.memoryEntityId).not.toBeNull()
    const obs = queries.getObservations(db, task.memoryEntityId!)
    expect(obs.length).toBe(1)
    expect(obs[0].content).toContain('[FAILED]')
  })

  it('executes without memory context on first run', async () => {
    const id = createActiveTask('Fresh Task', 'First time run')
    mockExecute.mockResolvedValue({
      stdout: 'First run output', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(id, { db, resultsDir })

    // Prompt should be unmodified (no memory context)
    const calledPrompt = mockExecute.mock.calls[0][0]
    expect(calledPrompt).toBe('First time run')
  })

  it('accumulates memory across multiple runs', async () => {
    const id = createActiveTask('Multi Run', 'Check things')

    for (let i = 0; i < 3; i++) {
      mockExecute.mockResolvedValue({
        stdout: `Run ${i} output`, stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
      })
      await executeTask(id, { db, resultsDir })
    }

    const task = queries.getTask(db, id)!
    const obs = queries.getObservations(db, task.memoryEntityId!)
    expect(obs.length).toBe(3)

    // Third run should have had context from first two
    const thirdCallPrompt = mockExecute.mock.calls[2][0]
    expect(thirdCallPrompt).toContain('Your previous results')
    expect(thirdCallPrompt).toContain('Run 1 output')
  })
})

// ─── Worker System Prompt ────────────────────────────────────

describe('executeTask - worker system prompt', () => {
  it('passes worker system prompt to executor', async () => {
    const worker = queries.createWorker(db, { name: 'Bot', systemPrompt: 'You are a bot.' })
    const task = queries.createTask(db, {
      name: 'Worker Task',
      prompt: 'Do work',
      triggerType: 'manual',
      workerId: worker.id
    })

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith('Do work', expect.objectContaining({
      systemPrompt: 'You are a bot.'
    }))
  })

  it('uses default worker when task has no worker', async () => {
    queries.createWorker(db, { name: 'Default', systemPrompt: 'Default prompt.', isDefault: true })
    const id = createActiveTask('No Worker', 'Do stuff')

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith('Do stuff', expect.objectContaining({
      systemPrompt: 'Default prompt.'
    }))
  })

  it('passes no systemPrompt when no workers exist', async () => {
    const id = createActiveTask('Plain Task', 'No worker')

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith('No worker', expect.objectContaining({
      systemPrompt: undefined
    }))
  })

  it('prefers task worker over default worker', async () => {
    queries.createWorker(db, { name: 'Default', systemPrompt: 'Default.', isDefault: true })
    const specific = queries.createWorker(db, { name: 'Specific', systemPrompt: 'Specific.' })
    const task = queries.createTask(db, {
      name: 'Specific Worker',
      prompt: 'Do it',
      triggerType: 'manual',
      workerId: specific.id
    })

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith('Do it', expect.objectContaining({
      systemPrompt: 'Specific.'
    }))
  })
})

// ─── Task Timeout ──────────────────────────────────────────

describe('executeTask - timeout', () => {
  it('passes task-specific timeout to executeClaudeCode', async () => {
    const task = queries.createTask(db, {
      name: 'Long Task', prompt: 'Do research', triggerType: 'manual', timeoutMinutes: 60
    })

    mockExecute.mockResolvedValue({
      stdout: 'done', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(task.id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      timeoutMs: 60 * 60 * 1000
    }))
  })

  it('uses default timeout when task has no timeout set', async () => {
    const id = createActiveTask('Quick Task', 'Do something')

    mockExecute.mockResolvedValue({
      stdout: 'done', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: null
    })

    await executeTask(id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      timeoutMs: undefined
    }))
  })
})

// ─── Session Continuity ─────────────────────────────────────

describe('executeTask - session continuity', () => {
  it('stores session ID on task after successful run', async () => {
    const task = queries.createTask(db, {
      name: 'Session Task',
      prompt: 'Continue',
      triggerType: 'manual',
      sessionContinuity: true
    })

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      sessionId: 'sess-new-123'
    })

    await executeTask(task.id, { db, resultsDir })

    const updated = queries.getTask(db, task.id)!
    expect(updated.sessionId).toBe('sess-new-123')
  })

  it('resumes session on subsequent run', async () => {
    const task = queries.createTask(db, {
      name: 'Resume Task',
      prompt: 'Continue work',
      triggerType: 'manual',
      sessionContinuity: true
    })
    queries.updateTask(db, task.id, { sessionId: 'sess-existing' })

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      sessionId: 'sess-existing'
    })

    await executeTask(task.id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      resumeSessionId: 'sess-existing'
    }))
  })

  it('does not resume session for non-continuous tasks', async () => {
    const task = queries.createTask(db, {
      name: 'Stateless',
      prompt: 'No session',
      triggerType: 'manual',
      sessionContinuity: false
    })

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      sessionId: 'sess-abc'
    })

    await executeTask(task.id, { db, resultsDir })

    expect(mockExecute).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      resumeSessionId: undefined
    }))
    // Should not store session on non-continuous task
    expect(queries.getTask(db, task.id)!.sessionId).toBeNull()
  })

  it('retries without session on resume failure', async () => {
    const task = queries.createTask(db, {
      name: 'Retry Task',
      prompt: 'Do retry',
      triggerType: 'manual',
      sessionContinuity: true
    })
    queries.updateTask(db, task.id, { sessionId: 'sess-broken' })

    // First call fails (resume failure), second call succeeds (fresh)
    mockExecute
      .mockResolvedValueOnce({
        stdout: '', stderr: 'resume error', exitCode: 1, durationMs: 50, timedOut: false, sessionId: null
      })
      .mockResolvedValueOnce({
        stdout: 'fresh ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false, sessionId: 'sess-new'
      })

    const result = await executeTask(task.id, { db, resultsDir })

    expect(result.success).toBe(true)
    expect(result.output).toBe('fresh ok')
    // Should have cleared old session and stored new one
    expect(queries.getTask(db, task.id)!.sessionId).toBe('sess-new')
    // Should have been called twice
    expect(mockExecute).toHaveBeenCalledTimes(2)
    // Second call should NOT have resumeSessionId
    const retryOptions = mockExecute.mock.calls[1][1] as Record<string, unknown>
    expect(retryOptions.resumeSessionId).toBeUndefined()
  })

  it('stores session ID on task run', async () => {
    const task = queries.createTask(db, {
      name: 'Run Session',
      prompt: 'Go',
      triggerType: 'manual',
      sessionContinuity: true
    })

    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, durationMs: 100, timedOut: false,
      sessionId: 'sess-run-123'
    })

    await executeTask(task.id, { db, resultsDir })

    const runs = queries.getTaskRuns(db, task.id, 1)
    expect(runs[0].sessionId).toBe('sess-run-123')
  })
})
