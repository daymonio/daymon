import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerResponse } from 'http'
import { addSSEClient, emitEvent } from '../events'

function createMockResponse(): ServerResponse {
  const res = {
    writeHead: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    end: vi.fn()
  } as unknown as ServerResponse
  return res
}

describe('SSE events', () => {
  it('sends SSE headers when client connects', () => {
    const res = createMockResponse()
    addSSEClient(res)

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    expect(res.write).toHaveBeenCalledWith(':\n\n')
  })

  it('registers close handler to clean up client', () => {
    const res = createMockResponse()
    addSSEClient(res)
    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function))
  })

  it('emits events to connected clients', () => {
    const res = createMockResponse()
    addSSEClient(res)

    emitEvent('task:complete', { taskId: 1, taskName: 'Test' })

    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('event: task:complete')
    )
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"taskId":1')
    )
  })

  it('emits to multiple clients', () => {
    const res1 = createMockResponse()
    const res2 = createMockResponse()
    addSSEClient(res1)
    addSSEClient(res2)

    emitEvent('task:failed', { taskId: 2 })

    // Both get the initial :\n\n comment + the event
    expect(res1.write).toHaveBeenCalledTimes(2)
    expect(res2.write).toHaveBeenCalledTimes(2)
  })

  it('removes client that throws on write', () => {
    const badRes = createMockResponse()
    const goodRes = createMockResponse()

    // Add both clients (initial write succeeds)
    addSSEClient(badRes)
    addSSEClient(goodRes)

    // Now make badRes throw on subsequent writes
    ;(badRes.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('connection reset')
    })

    // First emit — badRes throws and gets removed
    emitEvent('task:complete', { taskId: 1 })
    // Second emit — only goodRes should receive
    emitEvent('task:complete', { taskId: 2 })

    // goodRes gets: initial comment + 2 events = 3 writes
    const goodWrites = (goodRes.write as ReturnType<typeof vi.fn>).mock.calls
    expect(goodWrites.length).toBe(3)
  })
})
