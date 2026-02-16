/**
 * Sidecar lifecycle manager — launches, connects, and manages the sidecar process.
 *
 * Electron launches the sidecar as a detached Node.js process with stdio: 'ignore'
 * to avoid the spawn EBADF error that plagues pipe-based child processes.
 * Communication happens via HTTP on localhost.
 */

import { spawn, execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { get as httpGet, request as httpRequest, type IncomingMessage } from 'http'
import { app } from 'electron'
import { getConfig } from './config'
import { resolveNodePath } from './claude-config'
import { notifyTaskComplete, notifyTaskFailed } from './notifications'

let sidecarPort: number | null = null
let sseConnection: IncomingMessage | null = null
let healthTimer: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0

const MAX_FAILURES_BEFORE_RESTART = 3
const HEALTH_CHECK_INTERVAL_MS = 30_000
const PORT_FILE_POLL_INTERVAL_MS = 200
const PORT_FILE_POLL_TIMEOUT_MS = 8000

// ─── Path resolution ──────────────────────────────────────

function getSidecarPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mcp', 'sidecar.js')
  }
  return join(app.getAppPath(), 'out', 'mcp', 'sidecar.js')
}

// ─── Launch ───────────────────────────────────────────────

export async function launchSidecar(): Promise<void> {
  const config = getConfig()
  const portFile = join(config.dataDir, 'sidecar.port')
  const pidFile = join(config.dataDir, 'sidecar.pid')

  // Check if a sidecar is already running
  if (existsSync(pidFile) && existsSync(portFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
      process.kill(pid, 0) // Throws if process doesn't exist
      const port = parseInt(readFileSync(portFile, 'utf-8').trim(), 10)
      if (port > 0) {
        console.log(`Sidecar already running (PID ${pid}, port ${port})`)
        sidecarPort = port
        startHealthCheck()
        connectSSE()
        return
      }
    } catch {
      // Stale PID file — launch a new sidecar
    }
  }

  const nodePath = resolveNodePath()
  const sidecarPath = getSidecarPath()

  console.log(`Launching sidecar: ${nodePath} ${sidecarPath}`)

  const env: Record<string, string> = {}
  // Copy current env, stripping Electron vars
  for (const [key, value] of Object.entries(process.env)) {
    if (key === 'ELECTRON_RUN_AS_NODE') continue
    if (value !== undefined) env[key] = value
  }
  env.DAYMON_DB_PATH = config.dbPath
  env.DAYMON_RESULTS_DIR = config.resultsDir
  env.DAYMON_DATA_DIR = config.dataDir

  // Launch sidecar through a shell wrapper that closes inherited Electron FDs.
  // Electron's patched runtime leaves stale FDs (chromium internals) in the child.
  // If we spawn node directly, those bad FDs cause EBADF when the sidecar later
  // calls spawn('claude'). The shell closes them before exec'ing into node.
  const closeAndExec = [
    '-c',
    // Close all FDs > 2 (inherited from Electron), then exec into node
    `for fd in /dev/fd/*; do n=$(basename "$fd"); [ "$n" -gt 2 ] && eval "exec $n>&-" 2>/dev/null; done; exec "${nodePath}" "${sidecarPath}"`
  ]

  try {
    const child = spawn('/bin/sh', closeAndExec, {
      detached: true,
      stdio: 'ignore',
      env
    })
    child.unref()
    console.log(`Sidecar spawned via shell wrapper (PID ${child.pid})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Failed to spawn sidecar: ${msg}`)

    // Fallback: launch via nohup
    try {
      console.log('Trying nohup fallback to launch sidecar...')
      const cmd = `for fd in /dev/fd/*; do n=$(basename "$fd"); [ "$n" -gt 2 ] && eval "exec $n>&-" 2>/dev/null; done; exec "${nodePath}" "${sidecarPath}"`
      execSync(`nohup /bin/sh -c '${cmd}' &`, {
        env,
        stdio: 'ignore',
        timeout: 5000
      })
      console.log('Sidecar launched via nohup fallback')
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      console.error(`Nohup fallback also failed: ${fallbackMsg}`)
      return
    }
  }

  // Wait for port file
  const port = await waitForPortFile(portFile)
  if (port) {
    sidecarPort = port
    console.log(`Sidecar ready on port ${port}`)
    startHealthCheck()
    connectSSE()
  } else {
    console.error('Sidecar failed to start (no port file after timeout)')
  }
}

function waitForPortFile(portFile: string): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = (): void => {
      if (existsSync(portFile)) {
        try {
          const port = parseInt(readFileSync(portFile, 'utf-8').trim(), 10)
          if (port > 0) { resolve(port); return }
        } catch { /* retry */ }
      }
      if (Date.now() - start > PORT_FILE_POLL_TIMEOUT_MS) {
        resolve(null)
        return
      }
      setTimeout(check, PORT_FILE_POLL_INTERVAL_MS)
    }
    check()
  })
}

// ─── HTTP Client ──────────────────────────────────────────

export function sidecarFetch(method: string, path: string, body?: unknown): Promise<unknown> {
  if (!sidecarPort) return Promise.resolve(null)

  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: sidecarPort,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    }

    const req = httpRequest(options, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(data)
        }
      })
    })

    req.on('error', (err) => {
      console.error(`Sidecar fetch error (${method} ${path}):`, err.message)
      resolve(null)
    })

    req.setTimeout(10000, () => {
      req.destroy()
      resolve(null)
    })

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

// ─── SSE Connection ───────────────────────────────────────

function connectSSE(): void {
  if (!sidecarPort) return
  if (sseConnection) {
    sseConnection.destroy()
    sseConnection = null
  }

  const url = `http://127.0.0.1:${sidecarPort}/events`
  httpGet(url, (res) => {
    sseConnection = res
    let buffer = ''

    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      // Process complete SSE messages (separated by double newline)
      const messages = buffer.split('\n\n')
      buffer = messages.pop() || ''
      for (const msg of messages) {
        processSSEMessage(msg)
      }
    })

    res.on('end', () => {
      sseConnection = null
      // Reconnect after a delay
      setTimeout(connectSSE, 2000)
    })

    res.on('error', () => {
      sseConnection = null
      setTimeout(connectSSE, 2000)
    })
  }).on('error', () => {
    setTimeout(connectSSE, 2000)
  })
}

function processSSEMessage(raw: string): void {
  const lines = raw.split('\n')
  let eventType = ''
  let dataStr = ''

  for (const line of lines) {
    if (line.startsWith('event: ')) eventType = line.slice(7).trim()
    if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
  }

  if (!eventType || !dataStr) return

  try {
    const data = JSON.parse(dataStr)
    if (eventType === 'task:complete') {
      notifyTaskComplete(data.taskName, data.outputPreview)
    } else if (eventType === 'task:failed') {
      notifyTaskFailed(data.taskName, data.errorMessage || 'Unknown error')
    }
  } catch {
    // Ignore malformed SSE
  }
}

// ─── Health Check ─────────────────────────────────────────

function startHealthCheck(): void {
  if (healthTimer) clearInterval(healthTimer)
  consecutiveFailures = 0
  healthTimer = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS)
}

function checkHealth(): void {
  if (!sidecarPort) return

  const req = httpGet(`http://127.0.0.1:${sidecarPort}/health`, (res) => {
    let data = ''
    res.on('data', (chunk: Buffer) => { data += chunk.toString() })
    res.on('end', () => {
      try {
        const result = JSON.parse(data)
        if (result.ok) {
          consecutiveFailures = 0
          return
        }
      } catch { /* fall through */ }
      handleHealthFailure()
    })
  })

  req.on('error', () => handleHealthFailure())
  req.setTimeout(5000, () => { req.destroy(); handleHealthFailure() })
}

function handleHealthFailure(): void {
  consecutiveFailures++
  console.warn(`Sidecar health check failed (${consecutiveFailures}/${MAX_FAILURES_BEFORE_RESTART})`)
  if (consecutiveFailures >= MAX_FAILURES_BEFORE_RESTART) {
    console.log('Sidecar appears dead, restarting...')
    sidecarPort = null
    consecutiveFailures = 0
    launchSidecar().catch((err) => {
      console.error('Failed to restart sidecar:', err)
    })
  }
}

// ─── Shutdown ─────────────────────────────────────────────

export async function shutdownSidecar(): Promise<void> {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null }
  if (sseConnection) { sseConnection.destroy(); sseConnection = null }

  if (sidecarPort) {
    try {
      await sidecarFetch('POST', '/shutdown')
    } catch { /* ignore */ }

    // If graceful shutdown didn't work, try killing by PID
    const config = getConfig()
    const pidFile = join(config.dataDir, 'sidecar.pid')
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
        process.kill(pid, 'SIGTERM')
      } catch { /* already dead */ }
    }
  }

  sidecarPort = null
}

export function isSidecarReady(): boolean {
  return sidecarPort !== null
}

export function getSidecarPort(): number | null {
  return sidecarPort
}
