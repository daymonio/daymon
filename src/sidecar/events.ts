/**
 * SSE event emitter for pushing real-time events to connected Electron clients.
 */

import type { ServerResponse } from 'http'

const clients = new Set<ServerResponse>()

export function addSSEClient(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write(':\n\n') // SSE comment to confirm connection
  clients.add(res)
  res.on('close', () => clients.delete(res))
}

export function emitEvent(type: string, data: Record<string, unknown>): void {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of clients) {
    try {
      client.write(payload)
    } catch {
      clients.delete(client)
    }
  }
}
