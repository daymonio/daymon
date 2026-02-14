import { spawn, execSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { getConfig } from './config'
import { getSetting } from './db/tasks'

let httpProcess: ChildProcess | null = null
let currentPort: number | null = null

const DEFAULT_PORT = 3001

function getNodePath(): string {
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim()
  } catch {
    return 'node'
  }
}

function getMcpServerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mcp', 'server.js')
  }
  return join(app.getAppPath(), 'out', 'mcp', 'server.js')
}

export function startHttpMcpServer(port?: number): void {
  if (httpProcess) {
    console.log('HTTP MCP server already running')
    return
  }

  const resolvedPort = port ?? DEFAULT_PORT
  const config = getConfig()
  const nodePath = getNodePath()
  const mcpServerPath = getMcpServerPath()

  httpProcess = spawn(nodePath, [mcpServerPath], {
    env: {
      ...process.env,
      DAYMON_DB_PATH: config.dbPath,
      DAYMON_RESULTS_DIR: config.resultsDir,
      DAYMON_HTTP_PORT: String(resolvedPort),
      ELECTRON_RUN_AS_NODE: undefined
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  currentPort = resolvedPort

  httpProcess.stderr?.on('data', (data: Buffer) => {
    console.log(`[MCP HTTP] ${data.toString().trim()}`)
  })

  httpProcess.on('close', (code) => {
    console.log(`HTTP MCP server exited with code ${code}`)
    httpProcess = null
    currentPort = null
  })

  httpProcess.on('error', (err) => {
    console.error('Failed to start HTTP MCP server:', err.message)
    httpProcess = null
    currentPort = null
  })

  console.log(`Starting HTTP MCP server on port ${resolvedPort}`)
}

export function stopHttpMcpServer(): void {
  if (httpProcess) {
    httpProcess.kill('SIGTERM')
    httpProcess = null
    currentPort = null
    console.log('HTTP MCP server stopped')
  }
}

export function getHttpMcpStatus(): { running: boolean; port: number | null } {
  return {
    running: httpProcess !== null,
    port: currentPort
  }
}

export function initHttpMcpIfEnabled(): void {
  const enabled = getSetting('chatgpt_enabled')
  if (enabled === 'true') {
    const portStr = getSetting('chatgpt_port')
    const port = portStr ? parseInt(portStr, 10) : DEFAULT_PORT
    startHttpMcpServer(port)
  }
}
