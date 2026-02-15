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

interface DaymonMcpEntry {
  command: string
  args: string[]
  env: {
    DAYMON_DB_PATH: string
    DAYMON_RESULTS_DIR: string
    DAYMON_SOURCE: string
  }
}

function getExpectedMcpEntry(): DaymonMcpEntry {
  const mcpServerPath = getMcpServerPath()
  const nodePath = getNodePath()
  const appConfig = getConfig()
  return {
    command: nodePath,
    args: [mcpServerPath],
    env: {
      DAYMON_DB_PATH: appConfig.dbPath,
      DAYMON_RESULTS_DIR: appConfig.resultsDir,
      DAYMON_SOURCE: 'claude-desktop'
    }
  }
}

export function ensureClaudeConfig(): void {
  try {
    const configPath = getClaudeConfigPath()
    const expectedEntry = getExpectedMcpEntry()

    // Read existing config or start fresh
    let config: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8')
      config = JSON.parse(raw)
    } else {
      mkdirSync(dirname(configPath), { recursive: true })
    }

    // Build expected entry
    // Check if daymon is already configured with correct command + path
    const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {}
    if (mcpServers.daymon) {
      const existing = mcpServers.daymon as Record<string, unknown>
      const existingArgs = existing.args as string[] | undefined
      if (existing.command === expectedEntry.command && existingArgs?.[0] === expectedEntry.args[0]) {
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

export function getClaudeIntegrationStatus(): { configured: boolean; configPath: string; expectedPath: string } {
  const configPath = getClaudeConfigPath()
  const expectedEntry = getExpectedMcpEntry()

  try {
    if (!existsSync(configPath)) {
      return { configured: false, configPath, expectedPath: expectedEntry.args[0] }
    }

    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as Record<string, unknown>
    const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {}
    const daymon = mcpServers.daymon as Record<string, unknown> | undefined
    if (!daymon) {
      return { configured: false, configPath, expectedPath: expectedEntry.args[0] }
    }

    const args = daymon.args as string[] | undefined
    const configured = daymon.command === expectedEntry.command && args?.[0] === expectedEntry.args[0]
    return { configured, configPath, expectedPath: expectedEntry.args[0] }
  } catch {
    return { configured: false, configPath, expectedPath: expectedEntry.args[0] }
  }
}

function getMcpServerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mcp', 'server.js')
  }
  return join(app.getAppPath(), 'out', 'mcp', 'server.js')
}
