import { app, BrowserWindow, Menu, Tray, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, DEFAULTS } from '../shared/constants'

let tray: Tray | null = null
let popoverWindow: BrowserWindow | null = null
let normalIcon: Electron.NativeImage | null = null
let badgeIcon: Electron.NativeImage | null = null

function createPopoverWindow(width?: number, height?: number): BrowserWindow {

  const window = new BrowserWindow({
    width: width ?? DEFAULTS.WINDOW_WIDTH,
    height: height ?? DEFAULTS.WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
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
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:' || url.protocol === 'x-apple.systempreferences:'
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

export function setTrayBadge(show: boolean): void {
  if (!tray) return
  if (show && badgeIcon) {
    tray.setImage(badgeIcon)
  } else if (!show && normalIcon) {
    tray.setImage(normalIcon)
  }
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(show ? '1' : '')
  }
}

export function createTray(largeWindow?: boolean): BrowserWindow {
  const icon = loadTrayIcon()
  const resizedIcon = icon.resize({ width: 22, height: 22 })
  normalIcon = resizedIcon
  badgeIcon = createBadgeIcon(icon)

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

function setBGRA(buf: Buffer, width: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const offset = (y * width + x) * 4
  // macOS bitmap is BGRA
  buf[offset] = b
  buf[offset + 1] = g
  buf[offset + 2] = r
  buf[offset + 3] = a
}

function createBadgeIcon(baseIcon: Electron.NativeImage): Electron.NativeImage {
  const size = { width: 22, height: 22 }
  const resized = baseIcon.resize(size)
  const bitmap = resized.toBitmap()
  const buf = Buffer.from(bitmap)

  const cx = 14
  const cy = 8
  const outerR = 8  // white border circle
  const innerR = 6  // red fill circle

  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= innerR) {
        setBGRA(buf, size.width, x, y, 255, 59, 48, 255) // red fill
      } else if (dist <= outerR) {
        setBGRA(buf, size.width, x, y, 255, 255, 255, 255) // white border
      }
    }
  }

  // Draw "1" in white, centered in the red circle
  // Pixel art: 3px wide, 8px tall
  const glyph = [
    [1, 0],
    [0, 1], [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [1, 6],
    [0, 7], [1, 7], [2, 7]
  ]
  const gx = cx - 1
  const gy = cy - 4

  for (const [px, py] of glyph) {
    const x = gx + px
    const y = gy + py
    if (x >= 0 && x < size.width && y >= 0 && y < size.height) {
      setBGRA(buf, size.width, x, y, 255, 255, 255, 255) // white
    }
  }

  const img = nativeImage.createFromBitmap(buf, size)
  img.setTemplateImage(false)
  return img
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
