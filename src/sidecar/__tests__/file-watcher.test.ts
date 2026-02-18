import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initTestDb } from '../../shared/__tests__/helpers/test-db'

// Track executeClaudeCode calls and control resolution
let executeResolve: ((value: unknown) => void) | null = null
let executeReject: ((reason: unknown) => void) | null = null
const mockExecuteClaudeCode = vi.fn()

vi.mock('../../shared/claude-code', () => ({
  executeClaudeCode: (...args: unknown[]) => {
    mockExecuteClaudeCode(...args)
    return new Promise((resolve, reject) => {
      executeResolve = resolve
      executeReject = reject
    })
  }
}))

vi.mock('../../shared/db-queries', () => ({
  listWatches: vi.fn().mockReturnValue([])
}))

// Must import after mocks
import { _testing } from '../file-watcher'

let db: Database.Database

beforeEach(() => {
  db = initTestDb()
  // Clear internal state between tests
  _testing.lastTrigger.clear()
  _testing.watchExecState.clear()
  mockExecuteClaudeCode.mockClear()
  executeResolve = null
  executeReject = null

  // Inject db into module by accessing _testing.handleTrigger (it uses module-level db)
  // We need to set the module-level db — use startAllWatches to do this
  // Actually, handleTrigger uses the module-level `db` which is set by startAllWatches.
  // For unit tests, we mock the db.prepare call instead.
})

afterEach(() => {
  db.close()
})

describe('handleTrigger execution lock', () => {
  it('suppresses events while an action is executing', async () => {
    // Manually set up the watch exec state to simulate executing
    const state = _testing.getWatchExecState(1)
    state.executing = true

    await _testing.handleTrigger(1, 'clean this', '/path/foo.csv')

    // Should not have called executeClaudeCode
    expect(mockExecuteClaudeCode).not.toHaveBeenCalled()
  })

  it('suppresses events during post-execution cooldown', async () => {
    const state = _testing.getWatchExecState(1)
    state.cooldownUntil = Date.now() + 10000 // 10s in the future

    await _testing.handleTrigger(1, 'clean this', '/path/foo.csv')

    expect(mockExecuteClaudeCode).not.toHaveBeenCalled()
  })

  it('allows events after cooldown expires', async () => {
    const state = _testing.getWatchExecState(1)
    state.cooldownUntil = Date.now() - 1 // Already expired

    // Mock the db.prepare call that handleTrigger uses
    // handleTrigger accesses module-level `db` which isn't set in tests
    // We need to handle the db.prepare error gracefully — it's in a try/catch so it's fine

    const triggerPromise = _testing.handleTrigger(1, 'clean this', '/path/foo.csv')

    // Should have called executeClaudeCode
    expect(mockExecuteClaudeCode).toHaveBeenCalledTimes(1)

    // Resolve the execution
    executeResolve!({ stdout: 'done', stderr: '', exitCode: 0, durationMs: 100, timedOut: false })
    await triggerPromise

    // After execution, state should be in cooldown
    expect(state.executing).toBe(false)
    expect(state.cooldownUntil).toBeGreaterThan(Date.now() - 100)
  })

  it('sets executing=true during execution and resets in finally', async () => {
    const state = _testing.getWatchExecState(1)

    const triggerPromise = _testing.handleTrigger(1, 'clean this', '/path/foo.csv')

    // During execution, state should be executing
    expect(state.executing).toBe(true)

    // Resolve
    executeResolve!({ stdout: 'done', stderr: '', exitCode: 0, durationMs: 100, timedOut: false })
    await triggerPromise

    // After execution, should be false
    expect(state.executing).toBe(false)
  })

  it('releases lock even on execution error', async () => {
    const state = _testing.getWatchExecState(1)

    const triggerPromise = _testing.handleTrigger(1, 'clean this', '/path/foo.csv')

    expect(state.executing).toBe(true)

    // Reject the execution
    executeReject!(new Error('claude CLI crashed'))
    await triggerPromise

    // Lock should be released
    expect(state.executing).toBe(false)
    // Cooldown should be set
    expect(state.cooldownUntil).toBeGreaterThan(Date.now() - 100)
  })

  it('multiple watches have independent state', async () => {
    const state1 = _testing.getWatchExecState(1)
    const state2 = _testing.getWatchExecState(2)

    // Lock watch 1
    state1.executing = true

    // Watch 2 should still work
    const triggerPromise = _testing.handleTrigger(2, 'process', '/path/bar.csv')

    expect(mockExecuteClaudeCode).toHaveBeenCalledTimes(1)
    expect(state2.executing).toBe(true)

    executeResolve!({ stdout: 'done', stderr: '', exitCode: 0, durationMs: 50, timedOut: false })
    await triggerPromise

    // Watch 1 should still be locked, watch 2 should be released
    expect(state1.executing).toBe(true)
    expect(state2.executing).toBe(false)
  })

  it('debounce still works (same file within 10s is suppressed)', async () => {
    // First trigger — sets the debounce timestamp
    const triggerPromise1 = _testing.handleTrigger(1, 'clean', '/path/foo.csv')
    executeResolve!({ stdout: 'done', stderr: '', exitCode: 0, durationMs: 50, timedOut: false })
    await triggerPromise1

    expect(mockExecuteClaudeCode).toHaveBeenCalledTimes(1)

    // Reset cooldown so only debounce is the gate
    const state = _testing.getWatchExecState(1)
    state.cooldownUntil = 0

    // Second trigger for same file — should be debounced
    await _testing.handleTrigger(1, 'clean', '/path/foo.csv')

    // Still only 1 call
    expect(mockExecuteClaudeCode).toHaveBeenCalledTimes(1)
  })

  it('sets cooldown to POST_EXEC_COOLDOWN_MS after execution', async () => {
    const beforeExec = Date.now()

    const triggerPromise = _testing.handleTrigger(1, 'clean', '/path/foo.csv')
    executeResolve!({ stdout: 'done', stderr: '', exitCode: 0, durationMs: 50, timedOut: false })
    await triggerPromise

    const state = _testing.getWatchExecState(1)
    const afterExec = Date.now()

    // Cooldown should be approximately now + POST_EXEC_COOLDOWN_MS
    expect(state.cooldownUntil).toBeGreaterThanOrEqual(beforeExec + _testing.POST_EXEC_COOLDOWN_MS)
    expect(state.cooldownUntil).toBeLessThanOrEqual(afterExec + _testing.POST_EXEC_COOLDOWN_MS)
  })
})
