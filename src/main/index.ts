import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createTray } from './tray'
import { initDatabase, closeDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { ensureClaudeConfig } from './claude-config'
import { startScheduler, stopScheduler } from './scheduler/cron'
import { startAllWatches, stopAllWatches } from './file-watcher'

// Prevent multiple instances — quit if another is already running
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.whenReady().then(() => {
  // Hide dock icon on macOS (menu bar app only)
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  electronApp.setAppUserModelId('io.daymon.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  registerIpcHandlers()
  createTray()
  ensureClaudeConfig()
  startScheduler()
  startAllWatches()
})

// Tray app: stay alive when all windows close
app.on('window-all-closed', () => {
  // Do nothing
})

app.on('before-quit', () => {
  stopAllWatches()
  stopScheduler()
  closeDatabase()
})
