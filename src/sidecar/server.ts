/**
 * Daymon Sidecar — standalone Node.js HTTP server.
 *
 * Runs all process-spawning work (claude CLI, cron, file watchers, embeddings)
 * outside of Electron's patched runtime, avoiding spawn EBADF errors.
 *
 * Electron launches this as a detached process and communicates via HTTP.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { writeFileSync, unlinkSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import Database from 'better-sqlite3'
import { runMigrations } from '../shared/db-migrations'
import { cleanupAllRunningRuns, getTask as getTaskFromDb, updateTask } from '../shared/db-queries'
import { loadSqliteVec } from '../shared/embeddings'
import { executeTask } from '../shared/task-runner'
import { startScheduler, stopScheduler, syncNow, getSchedulerStatus } from './scheduler'
import { startAllWatches, stopAllWatches, syncWatches } from './file-watcher'
import { addSSEClient, emitEvent } from './events'
import { notifyTaskComplete, notifyTaskFailed } from './notifications'

declare const __APP_VERSION__: string

// ─── Configuration ────────────────────────────────────────

function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') return p.replace('~', homedir())
  return p
}

const dbPath = expandTilde(process.env.DAYMON_DB_PATH || '')
const resultsDir = expandTilde(process.env.DAYMON_RESULTS_DIR || '')
const dataDir = expandTilde(process.env.DAYMON_DATA_DIR || '')
const requestedPort = parseInt(process.env.DAYMON_SIDECAR_PORT || '0', 10)

if (!dbPath || !resultsDir || !dataDir) {
  process.exit(1)
}

// ─── File-based logging ──────────────────────────────────
// Sidecar runs detached with stdio:'ignore', so console output is lost.
// Redirect to a log file so we can debug from Claude Code.

const LOG_DIR = join(homedir(), 'Daymon')
const LOG_FILE = join(LOG_DIR, 'sidecar.log')
const MAX_LOG_SIZE = 512 * 1024 // 512 KB

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    // Truncate if too large
    try {
      const { size } = require('fs').statSync(LOG_FILE)
      if (size > MAX_LOG_SIZE) writeFileSync(LOG_FILE, '')
    } catch { /* file doesn't exist yet */ }
    appendFileSync(LOG_FILE, line)
  } catch { /* ignore */ }
}

// Override console.log/error to also write to file
const origLog = console.log.bind(console)
const origError = console.error.bind(console)
console.log = (...args: unknown[]) => { origLog(...args); log(args.map(String).join(' ')) }
console.error = (...args: unknown[]) => { origError(...args); log('[ERROR] ' + args.map(String).join(' ')) }

log('Sidecar starting...')

// ─── Database ─────────────────────────────────────────────

const db = new Database(dbPath, { timeout: 10000 })
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')
loadSqliteVec(db)
runMigrations(db, (msg) => console.log(`Sidecar: ${msg}`))

const cleaned = cleanupAllRunningRuns(db)
if (cleaned > 0) console.log(`Sidecar: Cleaned up ${cleaned} stale task run(s)`)

// ─── HTTP Router ──────────────────────────────────────────

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

const startTime = Date.now()

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/'
  const method = req.method || 'GET'

  try {
    // GET /health
    if (method === 'GET' && url === '/health') {
      const status = getSchedulerStatus()
      jsonResponse(res, 200, {
        ok: true,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        pid: process.pid,
        scheduler: status
      })
      return
    }

    // GET /events (SSE)
    if (method === 'GET' && url === '/events') {
      addSSEClient(res)
      return
    }

    // POST /tasks/:id/run
    const taskRunMatch = url.match(/^\/tasks\/(\d+)\/run$/)
    if (method === 'POST' && taskRunMatch) {
      const taskId = parseInt(taskRunMatch[1], 10)
      const task = getTaskFromDb(db, taskId)
      if (!task) {
        jsonResponse(res, 404, { ok: false, error: 'Task not found' })
        return
      }
      // For ad-hoc runs, temporarily allow execution without changing persistent status
      const originalStatus = task.status
      if (task.status !== 'active') {
        updateTask(db, taskId, { status: 'active' })
      }
      // Fire-and-forget: return immediately, execute in background
      jsonResponse(res, 202, { ok: true, taskId, message: 'Task execution started' })
      executeTask(taskId, { db, resultsDir }).then((result) => {
        // Restore original status if it was changed for ad-hoc execution
        if (originalStatus !== 'active') {
          const currentTask = getTaskFromDb(db, taskId)
          if (currentTask && currentTask.status === 'active') {
            updateTask(db, taskId, { status: originalStatus })
          }
        }
        const freshTask = getTaskFromDb(db, taskId)
        const name = freshTask?.name || `Task ${taskId}`
        if (result.success) {
          notifyTaskComplete(db, taskId, name, result.output?.slice(0, 200), result.durationMs, freshTask?.nudgeMode)
        } else {
          notifyTaskFailed(db, taskId, name, result.errorMessage || 'Unknown error', freshTask?.nudgeMode)
        }
      }).catch((err) => {
        // Restore original status on unexpected error
        if (originalStatus !== 'active') {
          try { updateTask(db, taskId, { status: originalStatus }) } catch { /* best effort */ }
        }
        console.error(`Sidecar: Task ${taskId} execution error:`, err)
      })
      return
    }

    // POST /notify — relay task completion events for Electron push notifications
    if (method === 'POST' && url === '/notify') {
      const body = await readBody(req)
      let data: Record<string, unknown>
      try {
        data = JSON.parse(body)
      } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON' })
        return
      }
      const event = data.event
      if (event === 'task:complete' || event === 'task:failed') {
        emitEvent(event, data)
      }
      jsonResponse(res, 200, { ok: true })
      return
    }

    // POST /sync
    if (method === 'POST' && url === '/sync') {
      syncNow(resultsDir)
      syncWatches()
      jsonResponse(res, 200, { ok: true })
      return
    }

    // POST /shutdown
    if (method === 'POST' && url === '/shutdown') {
      jsonResponse(res, 200, { ok: true, message: 'Shutting down' })
      shutdown()
      return
    }

    // 404
    jsonResponse(res, 404, { error: 'Not found' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Sidecar: Request error (${method} ${url}):`, message)
    jsonResponse(res, 500, { error: message })
  }
}

// ─── Server Lifecycle ─────────────────────────────────────

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('Sidecar: Unhandled request error:', err)
    try { jsonResponse(res, 500, { error: 'Internal error' }) } catch { /* ignore */ }
  })
})

const portFile = join(dataDir, 'sidecar.port')
const pidFile = join(dataDir, 'sidecar.pid')

server.listen(requestedPort, '127.0.0.1', () => {
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0

  mkdirSync(dataDir, { recursive: true })
  writeFileSync(portFile, String(port))
  writeFileSync(pidFile, String(process.pid))

  console.log(`Sidecar: HTTP server listening on 127.0.0.1:${port} (PID ${process.pid})`)

  // Start background services
  startScheduler(db, resultsDir)
  startAllWatches(db)
})

function shutdown(): void {
  console.log('Sidecar: Shutting down...')
  stopScheduler()
  stopAllWatches()

  try { unlinkSync(portFile) } catch { /* ignore */ }
  try { unlinkSync(pidFile) } catch { /* ignore */ }

  server.close(() => {
    try { db.close() } catch { /* ignore */ }
    console.log('Sidecar: Shutdown complete')
    process.exit(0)
  })

  // Force exit after 3s if graceful shutdown hangs
  setTimeout(() => process.exit(0), 3000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
