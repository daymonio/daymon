import { app } from 'electron'
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import { homedir } from 'os'
import { getClaudeConfigPath, getConfig } from './config'

// ─── Node path resolution ────────────────────────────────────

let cachedNodePath: string | null = null

function resolveNodePath(): string {
  if (cachedNodePath) return cachedNodePath

  // Probe common locations (packaged Electron doesn't inherit login shell PATH)
  const home = homedir()
  const candidates = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node'
  ]

  // Add nvm versions (find highest installed version)
  const nvmDir = join(home, '.nvm', 'versions', 'node')
  if (existsSync(nvmDir)) {
    try {
      const versions = (readdirSync(nvmDir) as string[])
        .filter((v: string) => v.startsWith('v'))
        .sort()
        .reverse()
      for (const v of versions) {
        candidates.unshift(join(nvmDir, v, 'bin', 'node'))
      }
    } catch { /* ignore */ }
  }

  for (const p of candidates) {
    if (existsSync(p)) {
      cachedNodePath = p
      return p
    }
  }

  // Fall back to login shell resolution
  try {
    const resolved = execSync('which node', { encoding: 'utf-8', timeout: 5000 }).trim()
    if (resolved && existsSync(resolved)) {
      cachedNodePath = resolved
      return resolved
    }
  } catch { /* ignore */ }

  cachedNodePath = 'node'
  return 'node'
}

// ─── MCP entry ───────────────────────────────────────────────

interface DaymonMcpEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

function getMcpServerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mcp', 'server.js')
  }
  return join(app.getAppPath(), 'out', 'mcp', 'server.js')
}

function buildMcpEntry(source: string): DaymonMcpEntry {
  const mcpServerPath = getMcpServerPath()
  const nodePath = resolveNodePath()
  const appConfig = getConfig()
  return {
    command: nodePath,
    args: [mcpServerPath],
    env: {
      DAYMON_DB_PATH: appConfig.dbPath,
      DAYMON_RESULTS_DIR: appConfig.resultsDir,
      DAYMON_SOURCE: source
    }
  }
}

// ─── Shared patch logic ──────────────────────────────────────

function patchConfigFile(configPath: string, entry: DaymonMcpEntry, label: string): boolean {
  let config: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8')
    config = JSON.parse(raw)
  } else {
    mkdirSync(dirname(configPath), { recursive: true })
  }

  const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {}
  if (mcpServers.daymon) {
    const existing = mcpServers.daymon as Record<string, unknown>
    const existingArgs = existing.args as string[] | undefined
    if (existing.command === entry.command && existingArgs?.[0] === entry.args[0]) {
      return false // Already up to date
    }
  }

  // Backup before modifying
  if (existsSync(configPath)) {
    copyFileSync(configPath, configPath + '.daymon-backup')
  }

  mcpServers.daymon = entry
  config.mcpServers = mcpServers
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  console.log(`${label} config patched with Daymon MCP server`)
  return true
}

function checkConfigFile(configPath: string, entry: DaymonMcpEntry): boolean {
  try {
    if (!existsSync(configPath)) return false
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as Record<string, unknown>
    const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {}
    const daymon = mcpServers.daymon as Record<string, unknown> | undefined
    if (!daymon) return false
    const args = daymon.args as string[] | undefined
    return daymon.command === entry.command && args?.[0] === entry.args[0]
  } catch {
    return false
  }
}

// ─── Claude Desktop ──────────────────────────────────────────

function ensureClaudeDesktopConfig(): void {
  try {
    const configPath = getClaudeConfigPath()
    const entry = buildMcpEntry('claude-desktop')
    patchConfigFile(configPath, entry, 'Claude Desktop')
  } catch (error) {
    console.error('Failed to patch Claude Desktop config:', error)
  }
}

// ─── Claude Code ─────────────────────────────────────────────

function getClaudeCodeConfigPath(): string {
  return join(homedir(), '.claude.json')
}

function ensureClaudeCodeConfig(): void {
  try {
    const configPath = getClaudeCodeConfigPath()
    // Only patch if the file already exists — don't create ~/.claude.json
    // for users who don't have Claude Code installed
    if (!existsSync(configPath)) return
    const entry = buildMcpEntry('claude-code')
    patchConfigFile(configPath, entry, 'Claude Code')
  } catch (error) {
    console.error('Failed to patch Claude Code config:', error)
  }
}

// ─── Public API ──────────────────────────────────────────────

export function ensureClaudeConfig(): void {
  ensureClaudeDesktopConfig()
  ensureClaudeCodeConfig()
}

export interface IntegrationStatus {
  claudeDesktop: { configured: boolean; configPath: string }
  claudeCode: { configured: boolean; configPath: string }
}

export function getClaudeIntegrationStatus(): IntegrationStatus {
  const desktopPath = getClaudeConfigPath()
  const desktopEntry = buildMcpEntry('claude-desktop')
  const codePath = getClaudeCodeConfigPath()
  const codeEntry = buildMcpEntry('claude-code')

  return {
    claudeDesktop: {
      configured: checkConfigFile(desktopPath, desktopEntry),
      configPath: desktopPath
    },
    claudeCode: {
      configured: checkConfigFile(codePath, codeEntry),
      configPath: codePath
    }
  }
}
