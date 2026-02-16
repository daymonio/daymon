import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigPath, getConfig } from './config'
import { shutdownSidecar } from './sidecar'

export function removeFromClaudeConfig(): void {
  try {
    const configPath = getClaudeConfigPath()
    if (!existsSync(configPath)) return

    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    const mcpServers = config.mcpServers as Record<string, unknown> | undefined
    if (!mcpServers?.daymon) return

    delete mcpServers.daymon
    config.mcpServers = mcpServers

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('Removed Daymon from Claude Desktop config')
  } catch (error) {
    console.error('Failed to remove from Claude config:', error)
  }
}

export function deleteAppData(): void {
  const config = getConfig()
  try {
    if (existsSync(config.dbPath)) {
      rmSync(config.dbPath, { force: true })
      rmSync(config.dbPath + '-wal', { force: true })
      rmSync(config.dbPath + '-shm', { force: true })
    }
    if (existsSync(config.dataDir)) {
      rmSync(config.dataDir, { recursive: true, force: true })
    }
  } catch (error) {
    console.error('Failed to delete app data:', error)
  }
}

function killSidecar(): void {
  try {
    const config = getConfig()
    const pidFile = join(config.dataDir, 'sidecar.pid')
    if (existsSync(pidFile)) {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
      try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ }
    }
  } catch { /* non-fatal */ }
}

export function uninstall(): void {
  shutdownSidecar().catch(() => {})
  killSidecar()
  removeFromClaudeConfig()
  deleteAppData()
  app.quit()
}
