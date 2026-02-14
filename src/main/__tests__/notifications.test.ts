import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  state: {
    isSupported: true,
    constructorError: null as Error | null,
    showError: null as Error | null,
    showMode: 'show' as 'show' | 'failed' | 'none',
    createdCount: 0,
    lastOptions: null as Record<string, unknown> | null
  },
  getSetting: vi.fn(() => 'true' as string | null)
}))

vi.mock('electron', () => {
  const { EventEmitter } = require('events') as typeof import('events')

  class MockNotification extends EventEmitter {
    static isSupported(): boolean {
      return mocked.state.isSupported
    }

    constructor(options: Record<string, unknown>) {
      super()
      if (mocked.state.constructorError) {
        throw mocked.state.constructorError
      }
      mocked.state.createdCount += 1
      mocked.state.lastOptions = options
    }

    show(): void {
      if (mocked.state.showError) {
        throw mocked.state.showError
      }
      if (mocked.state.showMode === 'show') {
        setImmediate(() => this.emit('show'))
        return
      }
      if (mocked.state.showMode === 'failed') {
        setImmediate(() => this.emit('failed', {}, new Error('native delivery failed')))
      }
    }
  }

  return {
    Notification: MockNotification,
    app: {
      isPackaged: false,
      getAppPath: () => process.cwd(),
      getName: () => 'Daymon'
    }
  }
})

vi.mock('../db/tasks', () => ({
  getSetting: mocked.getSetting
}))

import { notifyTaskComplete, testNotification } from '../notifications'

describe('notifications', () => {
  beforeEach(() => {
    mocked.state.isSupported = true
    mocked.state.constructorError = null
    mocked.state.showError = null
    mocked.state.showMode = 'show'
    mocked.state.createdCount = 0
    mocked.state.lastOptions = null
    mocked.getSetting.mockReset()
    mocked.getSetting.mockReturnValue('true')
  })

  it('returns unsupported result when notifications are unavailable', async () => {
    mocked.state.isSupported = false

    const result = await testNotification()

    expect(result.shown).toBe(false)
    expect(result.reason).toMatch(/not supported/i)
  })

  it('returns shown when display succeeds', async () => {
    const result = await testNotification()

    expect(result.shown).toBe(true)
    expect(mocked.state.createdCount).toBe(1)
    if (process.platform === 'darwin') {
      expect(mocked.state.lastOptions?.subtitle).toBe('Daymon')
      expect(mocked.state.lastOptions?.icon).toBeUndefined()
    }
  })

  it('returns failure when show() throws', async () => {
    mocked.state.showError = new Error('permission denied')

    const result = await testNotification()

    expect(result.shown).toBe(false)
    expect(result.reason).toContain('permission denied')
  })

  it('does not create notifications for completed tasks when notifications are disabled', () => {
    mocked.getSetting.mockReturnValue('false')

    notifyTaskComplete('Demo Task', 'done')

    expect(mocked.state.createdCount).toBe(0)
  })
})
