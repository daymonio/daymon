import { app, BrowserWindow, Menu, Tray, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, DEFAULTS } from '../shared/constants'

let tray: Tray | null = null
let popoverWindow: BrowserWindow | null = null

function createPopoverWindow(width?: number, height?: number): BrowserWindow {

  const window = new BrowserWindow({
    width: width ?? DEFAULTS.WINDOW_WIDTH,
    height: height ?? DEFAULTS.WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#ffffff',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      shell.openExternal(details.url)
    } else {
      console.warn(`Blocked external URL with disallowed protocol: ${details.url}`)
    }
    return { action: 'deny' }
  })

  window.on('blur', () => {
    if (!is.dev) {
      window.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.webContents.on('did-finish-load', () => {
    console.log('Tray popover webContents loaded')
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Tray popover failed to load (${errorCode}): ${errorDescription}`)
  })

  return window
}

function isSafeExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

function showPopover(): void {
  if (!popoverWindow || !tray) return

  const trayBounds = tray.getBounds()
  const windowBounds = popoverWindow.getBounds()
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y
  })

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  const y = Math.round(trayBounds.y + trayBounds.height + 4)

  const maxX = display.workArea.x + display.workArea.width - windowBounds.width
  const maxY = display.workArea.y + display.workArea.height - windowBounds.height
  const clampedX = Math.min(Math.max(x, display.workArea.x), maxX)
  const clampedY = Math.min(y, maxY)

  popoverWindow.setPosition(clampedX, clampedY)
  popoverWindow.show()
  popoverWindow.focus()
}

export function showPopoverWindow(): void {
  if (!popoverWindow) return
  if (popoverWindow.isVisible()) {
    popoverWindow.focus()
    return
  }
  if (tray) {
    showPopover()
    return
  }
  popoverWindow.show()
  popoverWindow.focus()
}

export function showPopoverWindowFromDock(): void {
  if (!popoverWindow) return
  if (popoverWindow.isVisible()) {
    popoverWindow.focus()
    return
  }
  if (tray) {
    showPopover()
  } else {
    popoverWindow.center()
    popoverWindow.show()
    popoverWindow.focus()
  }
}

function togglePopover(): void {
  if (!popoverWindow) return
  if (popoverWindow.isVisible()) {
    popoverWindow.hide()
  } else {
    showPopover()
  }
}

export function resizePopoverWindow(large: boolean): void {
  if (!popoverWindow) return

  const width = large ? DEFAULTS.WINDOW_WIDTH_LARGE : DEFAULTS.WINDOW_WIDTH
  const height = large ? DEFAULTS.WINDOW_HEIGHT_LARGE : DEFAULTS.WINDOW_HEIGHT

  popoverWindow.setSize(width, height)

  if (popoverWindow.isVisible() && tray) {
    const trayBounds = tray.getBounds()
    const display = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y
    })

    const x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2)
    const y = Math.round(trayBounds.y + trayBounds.height + 4)

    const maxX = display.workArea.x + display.workArea.width - width
    const maxY = display.workArea.y + display.workArea.height - height
    const clampedX = Math.min(Math.max(x, display.workArea.x), maxX)
    const clampedY = Math.min(y, maxY)

    popoverWindow.setPosition(clampedX, clampedY)
  }
}

export function createTray(largeWindow?: boolean): BrowserWindow {
  const icon = loadTrayIcon()
  const resizedIcon = icon.resize({ width: 22, height: 22 })

  tray = new Tray(resizedIcon)
  tray.setToolTip(APP_NAME)

  const width = largeWindow ? DEFAULTS.WINDOW_WIDTH_LARGE : undefined
  const height = largeWindow ? DEFAULTS.WINDOW_HEIGHT_LARGE : undefined
  popoverWindow = createPopoverWindow(width, height)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Daymon', click: () => showPopover() },
    { type: 'separator' },
    { label: 'Star on GitHub', click: () => shell.openExternal('https://github.com/daymonio/daymon') },
    { label: 'Report Bug', click: () => shell.openExternal('https://github.com/daymonio/daymon/issues/new') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.on('click', () => togglePopover())
  tray.on('right-click', () => tray!.popUpContextMenu(contextMenu))

  return popoverWindow
}

function loadTrayIcon(): Electron.NativeImage {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const iconPath = join(root, 'resources', 'trayIconTemplate.png')

  if (existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) {
      return image
    }
  }

  // Fallback to logo
  const logoPath = join(root, 'resources', 'logo.png')
  if (existsSync(logoPath)) {
    const logo = nativeImage.createFromPath(logoPath)
    if (!logo.isEmpty()) {
      return logo.resize({ width: 22, height: 22 })
    }
  }

  console.warn(`Tray icon not found at ${iconPath}; using empty fallback.`)
  return nativeImage.createEmpty()
}
