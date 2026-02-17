import { autoUpdater } from 'electron-updater'
import { notifyUpdateAvailable } from './notifications'
import { setTrayBadge } from './tray'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'

interface UpdateState {
  status: UpdateStatus
  version?: string
  progress?: number
  error?: string
}

let state: UpdateState = { status: 'idle' }
let checkInterval: ReturnType<typeof setInterval> | null = null

const FOUR_HOURS = 4 * 60 * 60 * 1000
const INITIAL_DELAY = 10_000

export function getUpdateStatus(): UpdateState {
  return { ...state }
}

export function checkForUpdates(): void {
  if (state.status === 'checking' || state.status === 'downloading') return
  state = { status: 'checking' }
  autoUpdater.checkForUpdates().catch((err) => {
    state = { status: 'error', error: err instanceof Error ? err.message : String(err) }
  })
}

export function downloadUpdate(): void {
  if (state.status !== 'available') return
  state = { status: 'downloading', version: state.version, progress: 0 }
  autoUpdater.downloadUpdate().catch((err) => {
    state = { status: 'error', error: err instanceof Error ? err.message : String(err) }
  })
}

export function installUpdate(): void {
  if (state.status !== 'ready') return
  setTrayBadge(false)
  autoUpdater.quitAndInstall()
}

export function initUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    state = { status: 'available', version: info.version }
    setTrayBadge(true)
    notifyUpdateAvailable(info.version)
  })

  autoUpdater.on('update-not-available', () => {
    state = { status: 'not-available' }
    setTrayBadge(false)
  })

  autoUpdater.on('download-progress', (progress) => {
    state = { status: 'downloading', version: state.version, progress: Math.round(progress.percent) }
  })

  autoUpdater.on('update-downloaded', () => {
    state = { status: 'ready', version: state.version }
    setTrayBadge(true)
  })

  autoUpdater.on('error', (err) => {
    state = { status: 'error', error: err.message }
  })

  // Check after a short delay on startup, then periodically
  setTimeout(() => checkForUpdates(), INITIAL_DELAY)
  checkInterval = setInterval(() => checkForUpdates(), FOUR_HOURS)
}

export function stopUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

/** Dev-only: simulate an update-available state to test notification + UI card */
export function simulateUpdate(): void {
  const fakeVersion = '99.0.0'
  state = { status: 'available', version: fakeVersion }
  setTrayBadge(true)
  notifyUpdateAvailable(fakeVersion)
}
