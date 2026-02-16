import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createTray, showPopoverWindowFromDock } from './tray'
import { initDatabase, closeDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { ensureClaudeConfig } from './claude-config'
import { launchSidecar, shutdownSidecar } from './sidecar'
import { getSetting, setSetting } from './db/tasks'
import { initUpdater, stopUpdater } from './updater'
import { APP_NAME, APP_ID } from '../shared/constants'

function isBrokenPipeError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'EPIPE') {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('EPIPE') || message.includes('write EPIPE')
}

function safeLog(message: string, error?: unknown): void {
  const details = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error ?? '')
  try {
    process.stderr.write(`[daymon] ${message}${details ? `\n${details}` : ''}\n`)
  } catch {
    // Ignore logging failures during shutdown (e.g. broken pipes in dev tooling)
  }
}

function fatalMainError(message: string, error: unknown): never {
  safeLog(message, error)
  // Exit immediately to avoid a broken half-initialized process with no tray icon.
  process.exit(1)
}

function installBrokenPipeGuards(): void {
  const guard = (stream: NodeJS.WriteStream | undefined): void => {
    if (!stream) return
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (isBrokenPipeError(err)) {
        // In dev mode, toolchain pipes can close before Electron exits.
        // Ignore broken pipe writes from console output during shutdown.
        return
      }
      safeLog('Stream write error in main process', err)
    })
  }

  guard(process.stdout)
  guard(process.stderr)

  process.on('uncaughtException', (err) => {
    if (isBrokenPipeError(err)) {
      // Log but don't crash — EPIPE in child processes or during shutdown is non-fatal
      safeLog('Ignoring EPIPE in uncaughtException', err)
      return
    }
    fatalMainError('Uncaught exception in main process', err)
  })

  process.on('unhandledRejection', (reason) => {
    if (isBrokenPipeError(reason)) {
      safeLog('Ignoring EPIPE in unhandledRejection', reason)
      return
    }
    fatalMainError('Unhandled promise rejection in main process', reason)
  })
}

function bootstrap(): void {
  // Set app identity before instance lock for consistent lock scope and app attribution.
  app.setName(APP_NAME)
  electronApp.setAppUserModelId(APP_ID)

  // Prevent duplicate instances. If another instance holds the lock, focus it and exit.
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.exit(0)
    return
  }

  installBrokenPipeGuards()

  app.whenReady().then(() => {
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    initDatabase()

    // First launch: enable auto-launch and disable advanced mode.
    if (!getSetting('setup_complete')) {
      app.setLoginItemSettings({ openAtLogin: true })
      setSetting('advanced_mode', 'false')
      setSetting('setup_complete', 'true')
    }

    const largeWindow = getSetting('large_window_enabled') === 'true'

    registerIpcHandlers()
    createTray(largeWindow)

    // Defer heavy I/O + DB work so the tray icon becomes responsive immediately.
    // Without this, synchronous DB queries (cleanup, pruning, listTasks) block
    // the main thread and the tray icon never responds to clicks.
    setImmediate(() => {
      ensureClaudeConfig()
      launchSidecar().catch((err) => {
        console.error('Failed to launch sidecar:', err)
      })
      initUpdater()
    })
  }).catch((err) => {
    fatalMainError('Failed during app startup', err)
  })

  app.on('second-instance', () => {
    showPopoverWindowFromDock()
  })

  app.on('activate', () => {
    // Dock activation should always surface the window, even if tray placement fails.
    showPopoverWindowFromDock()
  })

  // Tray app: stay alive when all windows close
  app.on('window-all-closed', () => {
    // Do nothing
  })

  app.on('before-quit', () => {
    try {
      stopUpdater()
    } catch (err) {
      safeLog('Error while stopping updater', err)
    }
    try {
      shutdownSidecar()
    } catch (err) {
      safeLog('Error while stopping sidecar', err)
    }
    try {
      closeDatabase()
    } catch (err) {
      safeLog('Error while closing database', err)
    }
  })
}

bootstrap()
