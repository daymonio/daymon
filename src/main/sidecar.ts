/**
 * Sidecar lifecycle manager — launches, connects, and manages the sidecar process.
 *
 * Electron launches the sidecar as a detached Node.js process with stdio: 'ignore'
 * to avoid the spawn EBADF error that plagues pipe-based child processes.
 * Communication happens via HTTP on localhost.
 */

import { spawn } from 'child_process'
import { readFileSync, existsSync, openSync, closeSync } from 'fs'
import { join } from 'path'
import { get as httpGet, request as httpRequest, type IncomingMessage } from 'http'
import { app } from 'electron'
import { getConfig } from './config'
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

  // Use Electron's bundled node to ensure module version compatibility
  // In Electron, process.execPath is the Electron binary which can run as node with ELECTRON_RUN_AS_NODE
  const electronPath = process.execPath
  const sidecarPath = getSidecarPath()

  console.log(`Launching sidecar: ${electronPath} ${sidecarPath}`)

  const env: Record<string, string> = {}
  // Copy current env
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  // Set ELECTRON_RUN_AS_NODE so Electron runs as Node.js
  env.ELECTRON_RUN_AS_NODE = '1'
  env.DAYMON_DB_PATH = config.dbPath
  env.DAYMON_RESULTS_DIR = config.resultsDir
  env.DAYMON_DATA_DIR = config.dataDir
  // Disable GPU/ONNX for transformers to prevent crashes in VMs or systems without GPU
  env.TRANSFORMERS_DEVICE = 'cpu'
  env.USE_ONNX = 'false'
  env.TRANSFORMERS_CACHE = join(config.dataDir, 'huggingface-cache')

  if (process.platform === 'win32') {
    // On Windows, handle inheritance works differently — no stale FD issue.
    // Spawn directly with detached mode and windowsHide to prevent console flash.
    try {
      const child = spawn(electronPath, [sidecarPath], {
        detached: true,
        stdio: 'ignore',
        env,
        windowsHide: true
      })
      child.unref()
      console.log(`Sidecar spawned (PID ${child.pid})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Failed to spawn sidecar: ${msg}`)
      return
    }
  } else {
    // Unix: Spawn sidecar directly with log file for debugging
    const sidecarLogPath = join(config.dataDir, 'sidecar.log')

    let logFd: number | undefined
    try {
      logFd = openSync(sidecarLogPath, 'a')
    } catch (err) {
      console.error(`Failed to open sidecar log: ${err}`)
    }

    try {
      const child = spawn(electronPath, [sidecarPath], {
        detached: true,
        stdio: logFd !== undefined ? ['ignore', logFd, logFd] : 'ignore',
        env
      })
      child.unref()
      console.log(`Sidecar spawned (PID ${child.pid})`)

      if (logFd !== undefined) {
        closeSync(logFd)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Failed to spawn sidecar: ${msg}`)
      if (logFd !== undefined) {
        closeSync(logFd)
      }
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

    // Respect per-task nudge_mode for native notifications
    const nudgeMode: string = data.nudgeMode ?? 'always'
    const isSuccess = eventType === 'task:complete'
    const shouldShowNotification = nudgeMode === 'always'
      || (nudgeMode === 'failure_only' && !isSuccess)

    if (eventType === 'task:complete' && shouldShowNotification) {
      notifyTaskComplete(data.taskName, data.outputPreview)
    } else if (eventType === 'task:failed' && shouldShowNotification) {
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

/** Synchronous shutdown for use in before-quit — no async HTTP, just kill by PID. */
export function shutdownSidecarSync(): void {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null }
  if (sseConnection) { sseConnection.destroy(); sseConnection = null }
  const config = getConfig()
  const pidFile = join(config.dataDir, 'sidecar.pid')
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
      process.kill(pid, 'SIGTERM')
    } catch { /* already dead */ }
  }
  sidecarPort = null
}

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
