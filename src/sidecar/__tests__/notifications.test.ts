import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initTestDb } from '../../shared/__tests__/helpers/test-db'

// Mock SSE events and auto-nudge before importing notifications
vi.mock('../events', () => ({
  emitEvent: vi.fn()
}))

vi.mock('../../shared/auto-nudge', () => ({
  isInQuietHours: vi.fn().mockReturnValue(false),
  enqueueNudge: vi.fn()
}))

import { notifyTaskComplete, notifyTaskFailed } from '../notifications'
import { emitEvent } from '../events'
import { isInQuietHours, enqueueNudge } from '../../shared/auto-nudge'

let db: Database.Database

beforeEach(() => {
  db = initTestDb()
  vi.restoreAllMocks()
  vi.mocked(isInQuietHours).mockReturnValue(false)
  vi.mocked(enqueueNudge).mockReturnValue(undefined)
  vi.mocked(emitEvent).mockReturnValue(undefined)
})

afterEach(() => {
  db.close()
})

describe('notifyTaskComplete', () => {
  it('emits task:complete SSE event', () => {
    notifyTaskComplete(db, 1, 'Test Task', 'output preview', 5000)

    expect(emitEvent).toHaveBeenCalledWith('task:complete', {
      taskId: 1,
      taskName: 'Test Task',
      success: true,
      outputPreview: 'output preview',
      durationMs: 5000
    })
  })

  it('triggers auto-nudge when enabled', () => {
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('auto_nudge_enabled', 'true', datetime('now','localtime'))"
    ).run()

    vi.useFakeTimers()
    notifyTaskComplete(db, 1, 'Test', undefined, 3000)
    vi.advanceTimersByTime(600)

    expect(enqueueNudge).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 1, taskName: 'Test', success: true })
    )
    vi.useRealTimers()
  })

  it('does not nudge when auto_nudge_enabled is not set', () => {
    vi.useFakeTimers()
    notifyTaskComplete(db, 1, 'Test', undefined, 3000)
    vi.advanceTimersByTime(600)

    expect(enqueueNudge).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not nudge during quiet hours', () => {
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('auto_nudge_enabled', 'true', datetime('now','localtime'))"
    ).run()
    vi.mocked(isInQuietHours).mockReturnValue(true)

    vi.useFakeTimers()
    notifyTaskComplete(db, 1, 'Test', undefined, 3000)
    vi.advanceTimersByTime(600)

    expect(enqueueNudge).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('notifyTaskFailed', () => {
  it('emits task:failed SSE event', () => {
    notifyTaskFailed(db, 2, 'Failing Task', 'timeout reached')

    expect(emitEvent).toHaveBeenCalledWith('task:failed', {
      taskId: 2,
      taskName: 'Failing Task',
      success: false,
      errorMessage: 'timeout reached'
    })
  })

  it('includes error info in nudge', () => {
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('auto_nudge_enabled', 'true', datetime('now','localtime'))"
    ).run()

    vi.useFakeTimers()
    notifyTaskFailed(db, 3, 'Bad Task', 'spawn EBADF')
    vi.advanceTimersByTime(600)

    expect(enqueueNudge).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 3,
        success: false,
        errorMessage: 'spawn EBADF'
      })
    )
    vi.useRealTimers()
  })
})
