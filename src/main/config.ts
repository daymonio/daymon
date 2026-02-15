import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { APP_NAME } from '../shared/constants'

export interface DaymonConfig {
  dbPath: string
  resultsDir: string
  dataDir: string
  userDir: string
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
  isDev: boolean
}

let config: DaymonConfig | null = null

export function getConfig(): DaymonConfig {
  if (config) return config

  const platform = process.platform
  const isMac = platform === 'darwin'
  const isWindows = platform === 'win32'
  const isLinux = platform === 'linux'
  const isDev = !app.isPackaged

  // ~/Library/Application Support/Daymon (macOS)
  // %APPDATA%/Daymon (Windows)
  // ~/.config/Daymon (Linux)
  const dataDir = app.getPath('userData')

  // ~/Daymon/
  const userDir = join(app.getPath('home'), APP_NAME)
  const resultsDir = join(userDir, 'results')
  const dbPath = join(dataDir, 'daymon.db')

  ensureDir(dataDir)
  ensureDir(userDir)
  ensureDir(resultsDir)

  config = { dbPath, resultsDir, dataDir, userDir, isMac, isWindows, isLinux, isDev }
  return config
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function getClaudeConfigPath(): string {
  const platform = process.platform
  if (platform === 'darwin') {
    return join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  }
  if (platform === 'win32') {
    return join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json')
  }
  return join(app.getPath('home'), '.config', 'claude', 'config.json')
}
