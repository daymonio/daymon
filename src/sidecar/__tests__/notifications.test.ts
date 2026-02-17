import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initTestDb } from '../../shared/__tests__/helpers/test-db'

// Mock SSE events and auto-nudge before importing notifications
vi.mock('../events', () => ({
  emitEvent: vi.fn()
}))

vi.mock('../../shared/auto-nudge', () => ({
  isInQuietHours: vi.fn().mockReturnValue(false),
  enqueueNudge: vi.fn(),
  shouldNudgeTask: vi.fn().mockReturnValue(true)
}))

import { notifyTaskComplete, notifyTaskFailed } from '../notifications'
import { emitEvent } from '../events'
import { isInQuietHours, enqueueNudge, shouldNudgeTask } from '../../shared/auto-nudge'

let db: Database.Database

beforeEach(() => {
  db = initTestDb()
  vi.restoreAllMocks()
  vi.mocked(isInQuietHours).mockReturnValue(false)
  vi.mocked(enqueueNudge).mockReturnValue(undefined)
  vi.mocked(emitEvent).mockReturnValue(undefined)
  vi.mocked(shouldNudgeTask).mockReturnValue(true)
})

afterEach(() => {
  db.close()
})

describe('notifyTaskComplete', () => {
  it('emits task:complete SSE event with nudgeMode', () => {
    notifyTaskComplete(db, 1, 'Test Task', 'output preview', 5000)

    expect(emitEvent).toHaveBeenCalledWith('task:complete', {
      taskId: 1,
      taskName: 'Test Task',
      success: true,
      outputPreview: 'output preview',
      durationMs: 5000,
      nudgeMode: 'always'
    })
  })

  it('includes explicit nudgeMode in SSE event', () => {
    notifyTaskComplete(db, 1, 'Test Task', 'output', 3000, 'failure_only')

    expect(emitEvent).toHaveBeenCalledWith('task:complete', expect.objectContaining({
      nudgeMode: 'failure_only'
    }))
  })

  it('triggers auto-nudge when nudgeMode is always', () => {
    vi.useFakeTimers()
    notifyTaskComplete(db, 1, 'Test', undefined, 3000, 'always')
    vi.advanceTimersByTime(600)

    expect(shouldNudgeTask).toHaveBeenCalledWith('always', true)
    expect(enqueueNudge).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 1, taskName: 'Test', success: true })
    )
    vi.useRealTimers()
  })

  it('does not nudge when nudgeMode is never', () => {
    vi.mocked(shouldNudgeTask).mockReturnValue(false)

    vi.useFakeTimers()
    notifyTaskComplete(db, 1, 'Test', undefined, 3000, 'never')
    vi.advanceTimersByTime(600)

    expect(shouldNudgeTask).toHaveBeenCalledWith('never', true)
    expect(enqueueNudge).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not nudge during quiet hours', () => {
    vi.mocked(isInQuietHours).mockReturnValue(true)

    vi.useFakeTimers()
    notifyTaskComplete(db, 1, 'Test', undefined, 3000, 'always')
    vi.advanceTimersByTime(600)

    expect(enqueueNudge).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('defaults to always when nudgeMode not provided', () => {
    vi.useFakeTimers()
    notifyTaskComplete(db, 1, 'Test', undefined, 3000)
    vi.advanceTimersByTime(600)

    expect(shouldNudgeTask).toHaveBeenCalledWith('always', true)
    vi.useRealTimers()
  })

})

describe('notifyTaskFailed', () => {
  it('emits task:failed SSE event with nudgeMode', () => {
    notifyTaskFailed(db, 2, 'Failing Task', 'timeout reached')

    expect(emitEvent).toHaveBeenCalledWith('task:failed', {
      taskId: 2,
      taskName: 'Failing Task',
      success: false,
      errorMessage: 'timeout reached',
      nudgeMode: 'always'
    })
  })

  it('includes error info in nudge', () => {
    vi.useFakeTimers()
    notifyTaskFailed(db, 3, 'Bad Task', 'spawn EBADF', 'always')
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

  it('nudges on failure with failure_only mode', () => {
    vi.useFakeTimers()
    notifyTaskFailed(db, 3, 'Monitor', 'site down', 'failure_only')
    vi.advanceTimersByTime(600)

    expect(shouldNudgeTask).toHaveBeenCalledWith('failure_only', false)
    expect(enqueueNudge).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
