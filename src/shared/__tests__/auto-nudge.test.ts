import { describe, it, expect, vi, beforeEach } from 'vitest'

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
