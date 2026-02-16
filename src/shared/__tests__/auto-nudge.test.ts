import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shouldNudgeTask } from '../auto-nudge'

// ─── shouldNudgeTask ─────────────────────────────────────────

describe('shouldNudgeTask', () => {
  // 'always' mode — always nudge regardless of success/failure
  it('always + success → true', () => {
    expect(shouldNudgeTask('always', true)).toBe(true)
  })
  it('always + failure → true', () => {
    expect(shouldNudgeTask('always', false)).toBe(true)
  })

  // 'failure_only' mode — only nudge on failure
  it('failure_only + success → false', () => {
    expect(shouldNudgeTask('failure_only', true)).toBe(false)
  })
  it('failure_only + failure → true', () => {
    expect(shouldNudgeTask('failure_only', false)).toBe(true)
  })

  // 'never' mode — never nudge
  it('never + success → false', () => {
    expect(shouldNudgeTask('never', true)).toBe(false)
  })
  it('never + failure → false', () => {
    expect(shouldNudgeTask('never', false)).toBe(false)
  })

  // unknown mode falls through to default (always)
  it('unknown mode + success → true (defaults to always)', () => {
    expect(shouldNudgeTask('unknown_value', true)).toBe(true)
  })
})

// ─── isInQuietHours ──────────────────────────────────────────

describe('isInQuietHours', () => {
  let mockGetSetting: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    mockGetSetting = vi.fn()
  })

  async function setup() {
    vi.doMock('../db-queries', () => ({ getSetting: mockGetSetting }))
    vi.doMock('child_process', () => ({ execSync: vi.fn() }))
    vi.doMock('os', () => ({ platform: vi.fn().mockReturnValue('darwin') }))
    return await import('../auto-nudge')
  }

  it('returns false when quiet hours disabled', async () => {
    mockGetSetting.mockReturnValue(null)
    const mod = await setup()
    expect(mod.isInQuietHours({} as never)).toBe(false)
  })

  it('returns true when current time is within quiet hours (normal range)', async () => {
    mockGetSetting.mockImplementation((_db: unknown, key: string) => {
      if (key === 'auto_nudge_quiet_hours') return 'true'
      if (key === 'auto_nudge_quiet_from') return '00:00'
      if (key === 'auto_nudge_quiet_until') return '23:59'
      return null
    })
    const mod = await setup()
    expect(mod.isInQuietHours({} as never)).toBe(true)
  })

  it('returns false when current time is outside quiet hours (normal range)', async () => {
    // Set a 1-minute window in the past
    const now = new Date()
    const pastHour = (now.getHours() + 22) % 24 // 2 hours ago
    const from = `${String(pastHour).padStart(2, '0')}:00`
    const until = `${String(pastHour).padStart(2, '0')}:01`
    mockGetSetting.mockImplementation((_db: unknown, key: string) => {
      if (key === 'auto_nudge_quiet_hours') return 'true'
      if (key === 'auto_nudge_quiet_from') return from
      if (key === 'auto_nudge_quiet_until') return until
      return null
    })
    const mod = await setup()
    expect(mod.isInQuietHours({} as never)).toBe(false)
  })

  it('handles inverted range (e.g., 22:00 to 08:00)', async () => {
    // Set inverted range that covers all hours
    mockGetSetting.mockImplementation((_db: unknown, key: string) => {
      if (key === 'auto_nudge_quiet_hours') return 'true'
      if (key === 'auto_nudge_quiet_from') return '00:01'
      if (key === 'auto_nudge_quiet_until') return '00:00'
      return null
    })
    const mod = await setup()
    // This inverted range covers almost all day
    expect(mod.isInQuietHours({} as never)).toBe(true)
  })

  it('uses default values when settings are null', async () => {
    mockGetSetting.mockImplementation((_db: unknown, key: string) => {
      if (key === 'auto_nudge_quiet_hours') return 'true'
      return null // from/until will use defaults 08:00/22:00
    })
    const mod = await setup()
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const expected = currentMinutes >= 480 && currentMinutes < 1320 // 08:00–22:00
    expect(mod.isInQuietHours({} as never)).toBe(expected)
  })

  it('returns false on error (non-fatal)', async () => {
    mockGetSetting.mockImplementation(() => { throw new Error('DB error') })
    const mod = await setup()
    expect(mod.isInQuietHours({} as never)).toBe(false)
  })
})

// ─── enqueueNudge ────────────────────────────────────────────

describe('enqueueNudge', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function setup() {
    const mockExecSync = vi.fn()
    vi.doMock('child_process', () => ({ execSync: mockExecSync }))
    vi.doMock('os', () => ({ platform: vi.fn().mockReturnValue('darwin') }))
    vi.doMock('../db-queries', () => ({ getSetting: vi.fn() }))
    const mod = await import('../auto-nudge')
    return { mod, mockExecSync }
  }

  it('processes multiple enqueued nudges', async () => {
    const { mod, mockExecSync } = await setup()

    mod.enqueueNudge({ taskId: 1, taskName: 'Task A', success: true, durationMs: 1000 })
    mod.enqueueNudge({ taskId: 2, taskName: 'Task B', success: true, durationMs: 2000 })

    // Let any pending timers flush
    await vi.advanceTimersByTimeAsync(5000)

    // Both nudges should have been sent (each has findIdeBundle + nudge = 2 calls)
    const nudgeCalls = mockExecSync.mock.calls.filter(c => (c[0] as string).includes('keystroke'))
    expect(nudgeCalls.length).toBe(2)
    expect(nudgeCalls[0][0]).toContain('Task A')
    expect(nudgeCalls[1][0]).toContain('Task B')
  })

  it('processes single nudge without gap', async () => {
    const { mod, mockExecSync } = await setup()

    mod.enqueueNudge({ taskId: 1, taskName: 'Solo Task', success: true, durationMs: 1000 })

    // Should have made calls for findIdeBundle + nudge
    const calls = mockExecSync.mock.calls
    const nudgeCalls = calls.filter(c => (c[0] as string).includes('keystroke'))
    expect(nudgeCalls.length).toBe(1)
  })
})

// ─── nudgeClaudeCode ─────────────────────────────────────────

describe('nudgeClaudeCode', () => {
  let mockExecSync: ReturnType<typeof vi.fn>
  let mockPlatform: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    mockExecSync = vi.fn()
    mockPlatform = vi.fn().mockReturnValue('darwin')
  })

  async function importWithMocks() {
    vi.doMock('child_process', () => ({ execSync: mockExecSync }))
    vi.doMock('os', () => ({ platform: mockPlatform }))
    const mod = await import('../auto-nudge')
    return mod.nudgeClaudeCode
  }

  it('detects IDE and sends nudge with Cmd+L focus', async () => {
    const nudge = await importWithMocks()
    nudge({ taskId: 5, taskName: 'Test Task', success: true, durationMs: 12000 })

    // First call: findIdeBundle check, second call: the actual nudge
    expect(mockExecSync).toHaveBeenCalledTimes(2)
    const nudgeCall = mockExecSync.mock.calls[1][0] as string
    expect(nudgeCall).toContain('osascript')
    expect(nudgeCall).toContain('activate')
    expect(nudgeCall).toContain('keystroke "l" using command down')
    expect(nudgeCall).toContain('Test Task')
    expect(nudgeCall).toContain('completed successfully')
    expect(nudgeCall).toContain('12.0s')
    expect(nudgeCall).toContain('daymon_task_history')
  })

  it('does not call osascript on non-macOS platforms', async () => {
    mockPlatform.mockReturnValue('linux')
    const nudge = await importWithMocks()
    nudge({ taskId: 1, taskName: 'Test', success: true, durationMs: 1000 })

    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('does not throw when osascript fails', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('No accessibility permissions')
    })
    const nudge = await importWithMocks()

    expect(() => {
      nudge({ taskId: 1, taskName: 'Test', success: true, durationMs: 1000 })
    }).not.toThrow()
  })

  it('skips nudge when no IDE found', async () => {
    // All findIdeBundle calls fail (no IDE running)
    mockExecSync.mockImplementation(() => {
      throw new Error('not found')
    })
    const nudge = await importWithMocks()
    nudge({ taskId: 1, taskName: 'Test', success: true, durationMs: 1000 })

    // Only findIdeBundle attempts, no nudge call
    const calls = mockExecSync.mock.calls
    for (const call of calls) {
      expect(call[0] as string).not.toContain('keystroke')
    }
  })

  it('includes failure info in nudge message', async () => {
    const nudge = await importWithMocks()
    nudge({ taskId: 3, taskName: 'Failing Task', success: false, durationMs: 5000 })

    const nudgeCall = mockExecSync.mock.calls[1][0] as string
    expect(nudgeCall).toContain('failed')
    expect(nudgeCall).toContain('Failing Task')
  })

  it('properly escapes double quotes in task name', async () => {
    const nudge = await importWithMocks()
    nudge({ taskId: 1, taskName: 'Task with "quotes"', success: true, durationMs: 1000 })

    expect(mockExecSync).toHaveBeenCalledTimes(2)
    const nudgeCall = mockExecSync.mock.calls[1][0] as string
    expect(nudgeCall).toContain('Task with \\"quotes\\"')
  })

  it('sets 10s timeout on nudge execSync', async () => {
    const nudge = await importWithMocks()
    nudge({ taskId: 1, taskName: 'Test', success: true, durationMs: 1000 })

    const opts = mockExecSync.mock.calls[1][1] as Record<string, unknown>
    expect(opts.timeout).toBe(10000)
    expect(opts.stdio).toBe('ignore')
  })
})

