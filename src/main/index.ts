import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createTray } from './tray'
import { initDatabase, closeDatabase } from './db'
import { registerIpcHandlers } from './ipc'

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
})

// Tray app: stay alive when all windows close
app.on('window-all-closed', () => {
  // Do nothing
})

app.on('before-quit', () => {
  closeDatabase()
})
