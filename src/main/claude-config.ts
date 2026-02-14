import { app } from 'electron'
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import { getClaudeConfigPath, getConfig } from './config'

function getNodePath(): string {
  // process.execPath is the Electron binary, not node — resolve actual node
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim()
  } catch {
    return 'node'
  }
}

export function ensureClaudeConfig(): void {
  try {
    const configPath = getClaudeConfigPath()
    const mcpServerPath = getMcpServerPath()
    const nodePath = getNodePath()
    const appConfig = getConfig()
    const dbPath = appConfig.dbPath
    const resultsDir = appConfig.resultsDir

    // Read existing config or start fresh
    let config: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8')
      config = JSON.parse(raw)
    } else {
      mkdirSync(dirname(configPath), { recursive: true })
    }

    // Build expected entry
    const expectedEntry = {
      command: nodePath,
      args: [mcpServerPath],
      env: {
        DAYMON_DB_PATH: dbPath,
        DAYMON_RESULTS_DIR: resultsDir,
        DAYMON_SOURCE: 'claude-desktop'
      }
    }

    // Check if daymon is already configured with correct command + path
    const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {}
    if (mcpServers.daymon) {
      const existing = mcpServers.daymon as Record<string, unknown>
      const existingArgs = existing.args as string[] | undefined
      if (existing.command === nodePath && existingArgs?.[0] === mcpServerPath) {
        return // Already up to date
      }
    }

    // Backup existing config before modifying
    if (existsSync(configPath)) {
      copyFileSync(configPath, configPath + '.daymon-backup')
    }

    // Add/update daymon MCP server entry
    mcpServers.daymon = expectedEntry
    config.mcpServers = mcpServers

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('Claude Desktop config patched with Daymon MCP server')
  } catch (error) {
    // Non-fatal — app still works, user can manually configure
    console.error('Failed to patch Claude Desktop config:', error)
  }
}

function getMcpServerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mcp', 'server.js')
  }
  return join(app.getAppPath(), 'out', 'mcp', 'server.js')
}
