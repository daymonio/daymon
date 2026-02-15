import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initTestDb } from '../../../shared/__tests__/helpers/test-db'
import * as queries from '../../../shared/db-queries'

// Capture tool handlers by mocking McpServer
type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

const toolHandlers = new Map<string, ToolHandler>()

const mockServer = {
  registerTool: (_name: string, _opts: unknown, handler: ToolHandler) => {
    toolHandlers.set(_name, handler)
  }
}

// Mock getMcpDatabase to return our test DB
let db: Database.Database
vi.mock('../../db', () => ({
  getMcpDatabase: () => db
}))

// Mock task-runner to avoid spawning real processes
vi.mock('../../../shared/task-runner', () => ({
  executeTask: vi.fn().mockResolvedValue({
    success: true,
    output: 'Task output here',
    durationMs: 1234,
    errorMessage: null
  }),
  isTaskRunning: vi.fn().mockReturnValue(false)
}))

// Mock embeddings for memory tools
vi.mock('../../../shared/embeddings', () => ({
  embed: vi.fn(),
  isEngineReady: () => false,
  cosineSimilarity: vi.fn(),
  blobToVector: vi.fn(),
  initEngine: vi.fn().mockResolvedValue(undefined)
}))

beforeEach(async () => {
  toolHandlers.clear()
  db = initTestDb()

  // Dynamically import and register all tools
  const { registerSchedulerTools } = await import('../scheduler')
  const { registerMemoryTools } = await import('../memory')
  const { registerWorkerTools } = await import('../workers')
  const { registerWatcherTools } = await import('../watcher')

  registerSchedulerTools(mockServer as never)
  registerMemoryTools(mockServer as never)
  registerWorkerTools(mockServer as never)
  registerWatcherTools(mockServer as never)
})

afterEach(() => {
  db.close()
})

function getResponseText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text
}

// ─── Response format rules ────────────────────────────────────
// Every confirmation response must:
//   1. NOT contain task/entity IDs like "(id: 5)"
//   2. NOT contain cron expressions like "0 9 * * *"
//   3. NOT contain "session continuity"
//   4. NOT contain "Worker:" or worker details
//   5. NOT contain "Timeout:" or timeout details
//   6. NOT contain "daymon_run_task" or other tool names
//   7. NOT contain "Electron"
//   8. NOT contain "[IMPORTANT:" or other prompt instructions

const FORBIDDEN_PATTERNS = [
  /\(id:\s*\d+\)/i,
  /schedule:\s*[\d*]/i,
  /session continuity/i,
  /\bWorker:/i,
  /\bTimeout:/i,
  /daymon_\w+/i,
  /\bElectron\b/i,
  /\[IMPORTANT:/i,
  /RESPONSE STYLE/i,
]

function assertCleanResponse(text: string): void {
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(text, `Response leaked forbidden pattern ${pattern}: "${text}"`).not.toMatch(pattern)
  }
}

// ─── Scheduler tools ──────────────────────────────────────────

describe('daymon_schedule responses', () => {
  it('cron task: clean, no implementation details', async () => {
    const handler = toolHandlers.get('daymon_schedule')!
    const result = await handler({
      name: 'Morning Digest',
      prompt: 'Summarize HN stories',
      cronExpression: '0 9 * * 1-5',
      sessionContinuity: true,
      timeout: 60
    })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('Morning Digest')
    expect(text).not.toContain('0 9 * * 1-5')
    expect(text).not.toContain('session')
    expect(text).not.toContain('60')
  })

  it('one-time task: clean, no implementation details', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString()
    const handler = toolHandlers.get('daymon_schedule')!
    const result = await handler({
      name: 'One-off Report',
      prompt: 'Generate a report',
      scheduledAt: futureDate,
      timeout: 120
    })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('One-off Report')
    expect(text).not.toContain('120')
  })

  it('manual task: clean, no implementation details', async () => {
    const handler = toolHandlers.get('daymon_schedule')!
    const result = await handler({
      name: 'Ad-hoc Task',
      prompt: 'Do something on demand'
    })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('Ad-hoc Task')
    expect(text).not.toContain('daymon_run_task')
  })

  it('task with worker: does not expose worker details', async () => {
    const worker = queries.createWorker(db, {
      name: 'Researcher',
      systemPrompt: 'You are a researcher.',
      description: 'Research worker'
    })
    const handler = toolHandlers.get('daymon_schedule')!
    const result = await handler({
      name: 'Research Task',
      prompt: 'Research AI trends',
      cronExpression: '0 10 * * *',
      workerId: worker.id
    })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).not.toContain('Researcher')
    expect(text).not.toContain('Worker')
  })
})

describe('daymon_pause_task response', () => {
  it('clean confirmation, no ID', async () => {
    const task = queries.createTask(db, {
      name: 'My Task',
      prompt: 'do stuff',
      triggerType: 'manual',
      executor: 'claude_code'
    })
    const handler = toolHandlers.get('daymon_pause_task')!
    const result = await handler({ id: task.id })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('My Task')
  })
})

describe('daymon_resume_task response', () => {
  it('clean confirmation, no ID', async () => {
    const task = queries.createTask(db, {
      name: 'My Task',
      prompt: 'do stuff',
      triggerType: 'manual',
      executor: 'claude_code'
    })
    queries.pauseTask(db, task.id)
    const handler = toolHandlers.get('daymon_resume_task')!
    const result = await handler({ id: task.id })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('My Task')
  })
})

describe('daymon_delete_task response', () => {
  it('clean confirmation, no ID', async () => {
    const task = queries.createTask(db, {
      name: 'My Task',
      prompt: 'do stuff',
      triggerType: 'manual',
      executor: 'claude_code'
    })
    const handler = toolHandlers.get('daymon_delete_task')!
    const result = await handler({ id: task.id })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('My Task')
  })
})

describe('daymon_reset_session response', () => {
  it('clean confirmation, no ID', async () => {
    const task = queries.createTask(db, {
      name: 'Session Task',
      prompt: 'do stuff',
      triggerType: 'manual',
      executor: 'claude_code',
      sessionContinuity: true
    })
    const handler = toolHandlers.get('daymon_reset_session')!
    const result = await handler({ id: task.id })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('Session Task')
  })
})

// ─── Memory tools ─────────────────────────────────────────────

describe('daymon_remember response', () => {
  it('clean confirmation, no ID or category', async () => {
    const handler = toolHandlers.get('daymon_remember')!
    const result = await handler({
      name: 'favorite color',
      content: 'Blue is their favorite color',
      type: 'preference',
      category: 'personal'
    })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('favorite color')
    expect(text).not.toContain('personal')
    expect(text).not.toContain('category')
  })
})

describe('daymon_forget response', () => {
  it('clean confirmation, no ID', async () => {
    const entity = queries.createEntity(db, 'old memory', 'fact', 'work')
    const handler = toolHandlers.get('daymon_forget')!
    const result = await handler({ id: entity.id })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('old memory')
  })
})

// ─── Worker tools ─────────────────────────────────────────────

describe('daymon_create_worker response', () => {
  it('clean confirmation, no ID or default note', async () => {
    const handler = toolHandlers.get('daymon_create_worker')!
    const result = await handler({
      name: 'News Curator',
      systemPrompt: 'You curate news.',
      isDefault: true
    })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('News Curator')
    expect(text).not.toContain('default')
  })
})

describe('daymon_update_worker response', () => {
  it('clean confirmation, no ID', async () => {
    const worker = queries.createWorker(db, {
      name: 'Old Name',
      systemPrompt: 'prompt'
    })
    const handler = toolHandlers.get('daymon_update_worker')!
    const result = await handler({ id: worker.id, name: 'New Name' })
    const text = getResponseText(result)
    assertCleanResponse(text)
  })
})

describe('daymon_delete_worker response', () => {
  it('clean confirmation, no ID', async () => {
    const worker = queries.createWorker(db, {
      name: 'Doomed Worker',
      systemPrompt: 'prompt'
    })
    const handler = toolHandlers.get('daymon_delete_worker')!
    const result = await handler({ id: worker.id })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('Doomed Worker')
  })
})

// ─── Watcher tools ────────────────────────────────────────────

describe('daymon_watch response', () => {
  it('clean confirmation, no ID', async () => {
    const handler = toolHandlers.get('daymon_watch')!
    const result = await handler({
      path: '/tmp/test-downloads',
      actionPrompt: 'Process new files'
    })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('/tmp/test-downloads')
  })
})

describe('daymon_unwatch response', () => {
  it('clean confirmation, no ID', async () => {
    const watch = queries.createWatch(db, '/Users/test/docs', 'test watch', 'do stuff')
    const handler = toolHandlers.get('daymon_unwatch')!
    const result = await handler({ id: watch.id })
    const text = getResponseText(result)
    assertCleanResponse(text)
    expect(text).toContain('/Users/test/docs')
  })
})
