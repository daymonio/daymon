import { app, BrowserWindow, Tray, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { DEFAULTS } from '../shared/constants'

let tray: Tray | null = null
let popoverWindow: BrowserWindow | null = null

function createPopoverWindow(): BrowserWindow {

  const window = new BrowserWindow({
    width: DEFAULTS.WINDOW_WIDTH,
    height: DEFAULTS.WINDOW_HEIGHT,
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
    shell.openExternal(details.url)
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

  return window
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
  const clampedX = Math.min(Math.max(x, display.workArea.x), maxX)

  popoverWindow.setPosition(clampedX, y)
  popoverWindow.show()
  popoverWindow.focus()
}

function togglePopover(): void {
  if (!popoverWindow) return
  if (popoverWindow.isVisible()) {
    popoverWindow.hide()
  } else {
    showPopover()
  }
}

export function createTray(): BrowserWindow {
  const iconPath = join(
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    'resources',
    'trayIconTemplate.png'
  )

  const icon = nativeImage.createFromPath(iconPath)
  const resizedIcon = icon.resize({ width: 18, height: 18 })

  tray = new Tray(resizedIcon)
  tray.setToolTip('Daymon')

  popoverWindow = createPopoverWindow()

  tray.on('click', () => togglePopover())
  tray.on('right-click', () => togglePopover())

  return popoverWindow
}
