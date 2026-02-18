import { ipcMain, app, shell, clipboard, BrowserWindow, systemPreferences } from 'electron'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { platform } from 'os'
import { resizePopoverWindow } from './tray'
import * as memory from './db/memory'
import * as tasks from './db/tasks'
import { getConfig, getClaudeConfigPath } from './config'
import { checkClaudeCliAvailable } from '../shared/claude-code'
import { findIdeProcessLinux, findIdeProcessWindows } from '../shared/auto-nudge'
import { sidecarFetch } from './sidecar'
import { uninstall } from './uninstall'
import { checkForUpdates, downloadUpdate, installUpdate, getUpdateStatus, simulateUpdate } from './updater'
import { getClaudeIntegrationStatus } from './claude-config'
import { testNotification } from './notifications'
import { z } from 'zod'
import type { CreateTaskInput, CreateWorkerInput } from '../shared/types'
import {
  createTaskSchema,
  createWatchSchema,
  createWorkerSchema,
  idSchema,
  settingsKeySchema,
  settingsValueSchema,
  updateTaskSchema,
  updateWorkerSchema
} from '../shared/validation'

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
  }
  return parsed.data
}

export function registerIpcHandlers(): void {
  // ─── Memory: Entities ───────────────────────────────────

  ipcMain.handle('memory:createEntity', (_e, name: string, type?: string, category?: string) =>
    memory.createEntity(name, type, category)
  )
  ipcMain.handle('memory:getEntity', (_e, id: number) => memory.getEntity(parseOrThrow(idSchema, id)))
  ipcMain.handle('memory:listEntities', (_e, category?: string) => memory.listEntities(category))
  ipcMain.handle('memory:searchEntities', (_e, query: string) => memory.searchEntities(query))
  ipcMain.handle('memory:deleteEntity', (_e, id: number) => memory.deleteEntity(parseOrThrow(idSchema, id)))

  // ─── Memory: Observations ─────────────────────────────

  ipcMain.handle('memory:addObservation', (_e, entityId: number, content: string, source?: string) =>
    memory.addObservation(parseOrThrow(idSchema, entityId), content, source)
  )
  ipcMain.handle('memory:getObservations', (_e, entityId: number) => memory.getObservations(parseOrThrow(idSchema, entityId)))
  ipcMain.handle('memory:deleteObservation', (_e, id: number) => memory.deleteObservation(parseOrThrow(idSchema, id)))

  // ─── Memory: Relations ────────────────────────────────

  ipcMain.handle('memory:addRelation', (_e, fromEntity: number, toEntity: number, relationType: string) =>
    memory.addRelation(parseOrThrow(idSchema, fromEntity), parseOrThrow(idSchema, toEntity), relationType)
  )
  ipcMain.handle('memory:getRelations', (_e, entityId: number) => memory.getRelations(parseOrThrow(idSchema, entityId)))
  ipcMain.handle('memory:deleteRelation', (_e, id: number) => memory.deleteRelation(parseOrThrow(idSchema, id)))

  // ─── Memory: Stats ───────────────────────────────────

  ipcMain.handle('memory:getStats', () => memory.getMemoryStats())

  // ─── Workers ────────────────────────────────────────────

  ipcMain.handle('workers:create', (_e, input: CreateWorkerInput) => {
    const validated = parseOrThrow(createWorkerSchema, input)
    return tasks.createWorker(validated)
  })
  ipcMain.handle('workers:get', (_e, id: number) => tasks.getWorker(parseOrThrow(idSchema, id)))
  ipcMain.handle('workers:list', () => tasks.listWorkers())
  ipcMain.handle('workers:update', (_e, id: number, updates: Record<string, unknown>) => {
    const validatedId = parseOrThrow(idSchema, id)
    const validatedUpdates = parseOrThrow(updateWorkerSchema, updates)
    tasks.updateWorker(validatedId, validatedUpdates)
  })
  ipcMain.handle('workers:delete', (_e, id: number) => tasks.deleteWorker(parseOrThrow(idSchema, id)))
  ipcMain.handle('workers:getDefault', () => tasks.getDefaultWorker())
  ipcMain.handle('workers:count', () => tasks.getWorkerCount())

  // ─── Tasks ────────────────────────────────────────────

  ipcMain.handle('tasks:create', async (_e, task: CreateTaskInput) => {
    const validated = parseOrThrow(createTaskSchema, task)
    const result = tasks.createTask({
      ...validated,
      triggerConfig: JSON.stringify({ source: 'daymon' })
    })
    sidecarFetch('POST', '/sync').catch(() => {})
    return result
  })
  ipcMain.handle('tasks:get', (_e, id: number) => tasks.getTask(parseOrThrow(idSchema, id)))
  ipcMain.handle('tasks:list', (_e, status?: string) => {
    const validatedStatus = parseOrThrow(z.enum(['active', 'paused', 'completed']).optional(), status)
    return tasks.listTasks(validatedStatus)
  })
  ipcMain.handle('tasks:update', (_e, id: number, updates: Record<string, unknown>) => {
    const validatedId = parseOrThrow(idSchema, id)
    const validatedUpdates = parseOrThrow(updateTaskSchema, updates)
    tasks.updateTask(validatedId, validatedUpdates)
    sidecarFetch('POST', '/sync').catch(() => {})
  })
  ipcMain.handle('tasks:delete', (_e, id: number) => {
    tasks.deleteTask(parseOrThrow(idSchema, id))
    sidecarFetch('POST', '/sync').catch(() => {})
  })
  ipcMain.handle('tasks:pause', (_e, id: number) => {
    tasks.pauseTask(parseOrThrow(idSchema, id))
    sidecarFetch('POST', '/sync').catch(() => {})
  })
  ipcMain.handle('tasks:resume', (_e, id: number) => {
    tasks.resumeTask(parseOrThrow(idSchema, id))
    sidecarFetch('POST', '/sync').catch(() => {})
  })
  ipcMain.handle('tasks:getRuns', (_e, taskId: number) => tasks.getTaskRuns(parseOrThrow(idSchema, taskId)))
  ipcMain.handle('tasks:getLatestRun', (_e, taskId: number) => tasks.getLatestTaskRun(parseOrThrow(idSchema, taskId)))
  ipcMain.handle('tasks:listAllRuns', (_e, limit?: number) => {
    const validatedLimit = parseOrThrow(z.number().int().min(1).max(200).optional().default(20), limit)
    return tasks.listAllRuns(validatedLimit)
  })
  ipcMain.handle('tasks:runNow', (_e, id: number) => {
    const validatedId = parseOrThrow(idSchema, id)
    return sidecarFetch('POST', `/tasks/${validatedId}/run`)
  })
  ipcMain.handle('tasks:getRunningRuns', () => tasks.getRunningTaskRuns())
  ipcMain.handle('tasks:getConsoleLogs', (_e, runId: number, afterSeq?: number, limit?: number) => {
    const validatedRunId = parseOrThrow(idSchema, runId)
    const validatedAfterSeq = parseOrThrow(z.number().int().min(0).optional().default(0), afterSeq)
    const validatedLimit = parseOrThrow(z.number().int().min(1).max(500).optional().default(100), limit)
    return tasks.getConsoleLogs(validatedRunId, validatedAfterSeq, validatedLimit)
  })

  // ─── Settings ─────────────────────────────────────────

  ipcMain.handle('settings:get', (_e, key: string) => tasks.getSetting(parseOrThrow(settingsKeySchema, key)))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    const validatedKey = parseOrThrow(settingsKeySchema, key)
    const validatedValue = parseOrThrow(settingsValueSchema, value)
    tasks.setSetting(validatedKey, validatedValue)
  })
  ipcMain.handle('settings:getAll', () => tasks.getAllSettings())

  // ─── Watches ─────────────────────────────────────────

  ipcMain.handle('watches:create', (_e, path: string, description?: string, actionPrompt?: string) => {
    const validated = parseOrThrow(createWatchSchema, { path, description, actionPrompt })
    const watch = tasks.createWatch(validated.path, validated.description, validated.actionPrompt)
    sidecarFetch('POST', '/sync').catch(() => {})
    return watch
  })
  ipcMain.handle('watches:list', (_e, status?: string) => {
    const validatedStatus = parseOrThrow(z.enum(['active', 'paused']).optional(), status)
    return tasks.listWatches(validatedStatus)
  })
  ipcMain.handle('watches:delete', (_e, id: number) => {
    const validatedId = parseOrThrow(idSchema, id)
    tasks.deleteWatch(validatedId)
    sidecarFetch('POST', '/sync').catch(() => {})
  })
  ipcMain.handle('watches:pause', (_e, id: number) => {
    tasks.pauseWatch(parseOrThrow(idSchema, id))
    sidecarFetch('POST', '/sync').catch(() => {})
  })
  ipcMain.handle('watches:resume', (_e, id: number) => {
    tasks.resumeWatch(parseOrThrow(idSchema, id))
    sidecarFetch('POST', '/sync').catch(() => {})
  })
  ipcMain.handle('watches:count', (_e, status?: string) => {
    const validatedStatus = parseOrThrow(z.enum(['active', 'paused']).optional(), status)
    return tasks.getWatchCount(validatedStatus)
  })

  // ─── App ──────────────────────────────────────────────

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('app:getPaths', () => {
    const config = getConfig()
    return {
      dbPath: config.dbPath,
      resultsDir: config.resultsDir,
      dataDir: config.dataDir,
      claudeConfigPath: getClaudeConfigPath()
    }
  })
  ipcMain.handle('app:checkClaude', () => checkClaudeCliAvailable())
  ipcMain.handle('app:getClaudeIntegration', () => getClaudeIntegrationStatus())
  ipcMain.handle('app:getSchedulerStatus', async () => {
    const health = (await sidecarFetch('GET', '/health')) as Record<string, unknown> | null
    if (health && typeof health === 'object' && 'scheduler' in health) {
      return health.scheduler
    }
    // Sidecar not ready — return fallback
    return { running: false, jobCount: 0, jobs: [] }
  })
  ipcMain.handle('app:testNotification', () => testNotification())
  ipcMain.handle('app:getAutoLaunch', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('app:setAutoLaunch', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
  })
  ipcMain.handle('app:uninstall', () => uninstall())
  ipcMain.handle('app:getUpdateStatus', () => getUpdateStatus())
  ipcMain.handle('app:checkForUpdates', () => checkForUpdates())
  ipcMain.handle('app:downloadUpdate', () => downloadUpdate())
  ipcMain.handle('app:installUpdate', () => installUpdate())
  ipcMain.handle('app:simulateUpdate', () => simulateUpdate())
  ipcMain.handle('app:setWindowSize', (_e, large: boolean) => {
    resizePopoverWindow(large)
  })
  ipcMain.handle('app:hideWindow', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.hide()
  })
  ipcMain.handle('app:openFile', (_e, filePath: string) => shell.openPath(filePath))
  ipcMain.handle('app:requestAccessibility', () => {
    if (platform() !== 'darwin') return false
    const trusted = systemPreferences.isTrustedAccessibilityClient(true)
    if (!trusted) {
      try {
        execSync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')
      } catch { /* ignore */ }
    }
    return trusted
  })
  ipcMain.handle('app:showInFolder', (_e, filePath: string) => shell.showItemInFolder(filePath))
  ipcMain.handle('app:sendToApp', (_e, target: string, message: string, filePath?: string) => {
    const os = platform()

    if (os === 'darwin') {
      // macOS: use osascript + AppleScript
      const escaped = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

      if (target === 'claude-code') {
        const ideBundles = [
          'com.todesktop.230313mzl4w4u92', // Cursor
          'com.microsoft.VSCode',
          'com.microsoft.VSCodeInsiders'
        ]
        let ideBundle: string | null = null
        for (const bid of ideBundles) {
          try {
            execSync(
              `osascript -e 'tell application "System Events" to get first application process whose bundle identifier is "${bid}"'`,
              { timeout: 3000, stdio: 'ignore' }
            )
            ideBundle = bid
            break
          } catch { /* not running */ }
        }
        if (!ideBundle) throw new Error('No supported IDE (Cursor, VSCode) found running')

        const script = `
tell application id "${ideBundle}" to activate
delay 0.3
tell application "System Events"
  keystroke "l" using command down
  delay 0.3
  keystroke "${escaped}"
  keystroke return
end tell`
        execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
          timeout: 10000,
          stdio: 'ignore'
        })
      } else if (target === 'claude-desktop') {
        let fullMessage = message
        if (filePath) {
          const content = readFileSync(filePath, 'utf-8')
          fullMessage = `Present these task results in a well-formatted way:\n\n${content}`
        }
        clipboard.writeText(fullMessage)

        const script = `
tell application "Claude" to activate
delay 0.5
tell application "System Events"
  keystroke "n" using command down
  delay 0.3
  keystroke "v" using command down
  delay 0.2
  keystroke return
end tell`
        execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
          timeout: 10000,
          stdio: 'ignore'
        })
      } else {
        throw new Error(`Unknown target: ${target}`)
      }
    } else if (os === 'linux') {
      // Linux: use xdotool (X11 only)
      if (process.env.XDG_SESSION_TYPE === 'wayland') {
        throw new Error('Send to app is not supported on Wayland (requires X11)')
      }
      try {
        execSync('which xdotool', { timeout: 3000, stdio: 'ignore' })
      } catch {
        throw new Error('xdotool is required. Install with: sudo apt install xdotool')
      }

      if (target === 'claude-code') {
        const ide = findIdeProcessLinux()
        if (!ide) throw new Error('No supported IDE (Cursor, VSCode) found running')

        const wid = execSync(`xdotool search --name "${ide.windowName}" | head -1`, {
          encoding: 'utf-8', timeout: 5000
        }).trim()
        if (!wid) throw new Error(`Could not find window for ${ide.windowName}`)

        execSync(`xdotool windowactivate --sync ${wid}`, { timeout: 5000, stdio: 'ignore' })
        execSync(`xdotool key --window ${wid} ctrl+l`, { timeout: 5000, stdio: 'ignore' })
        execSync('sleep 0.3', { timeout: 5000, stdio: 'ignore' })
        execSync(`xdotool type --window ${wid} --clearmodifiers -- ${JSON.stringify(message)}`, { timeout: 10000, stdio: 'ignore' })
        execSync(`xdotool key --window ${wid} Return`, { timeout: 5000, stdio: 'ignore' })
      } else if (target === 'claude-desktop') {
        let fullMessage = message
        if (filePath) {
          const content = readFileSync(filePath, 'utf-8')
          fullMessage = `Present these task results in a well-formatted way:\n\n${content}`
        }
        clipboard.writeText(fullMessage)

        const wid = execSync('xdotool search --name "Claude" | head -1', {
          encoding: 'utf-8', timeout: 5000
        }).trim()
        if (!wid) throw new Error('Claude Desktop window not found')

        execSync(`xdotool windowactivate --sync ${wid}`, { timeout: 5000, stdio: 'ignore' })
        execSync(`xdotool key --window ${wid} ctrl+n`, { timeout: 5000, stdio: 'ignore' })
        execSync('sleep 0.3', { timeout: 5000, stdio: 'ignore' })
        execSync(`xdotool key --window ${wid} ctrl+v`, { timeout: 5000, stdio: 'ignore' })
        execSync('sleep 0.2', { timeout: 5000, stdio: 'ignore' })
        execSync(`xdotool key --window ${wid} Return`, { timeout: 5000, stdio: 'ignore' })
      } else {
        throw new Error(`Unknown target: ${target}`)
      }
    } else if (os === 'win32') {
      // Windows: use PowerShell + WScript.Shell COM
      if (target === 'claude-code') {
        const ide = findIdeProcessWindows()
        if (!ide) throw new Error('No supported IDE (Cursor, VSCode) found running')

        const escaped = message.replace(/([+^%~(){}[\]])/g, '{$1}')
        const ps = [
          '$wsh = New-Object -ComObject WScript.Shell;',
          `$proc = Get-Process '${ide.process}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1;`,
          'if ($proc) {',
          '  [void]$wsh.AppActivate($proc.Id);',
          '  Start-Sleep -Milliseconds 300;',
          "  $wsh.SendKeys('^l');",
          '  Start-Sleep -Milliseconds 300;',
          `  $wsh.SendKeys('${escaped.replace(/'/g, "''")}');`,
          "  $wsh.SendKeys('{ENTER}');",
          '} else { exit 1 }'
        ].join(' ')
        execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
          timeout: 15000,
          stdio: 'ignore',
          windowsHide: true
        })
      } else if (target === 'claude-desktop') {
        let fullMessage = message
        if (filePath) {
          const content = readFileSync(filePath, 'utf-8')
          fullMessage = `Present these task results in a well-formatted way:\n\n${content}`
        }
        clipboard.writeText(fullMessage)

        const ps = [
          '$wsh = New-Object -ComObject WScript.Shell;',
          "$proc = Get-Process 'Claude' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1;",
          'if ($proc) {',
          '  [void]$wsh.AppActivate($proc.Id);',
          '  Start-Sleep -Milliseconds 500;',
          "  $wsh.SendKeys('^n');",
          '  Start-Sleep -Milliseconds 300;',
          "  $wsh.SendKeys('^v');",
          '  Start-Sleep -Milliseconds 200;',
          "  $wsh.SendKeys('{ENTER}');",
          '} else { exit 1 }'
        ].join(' ')
        execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
          timeout: 15000,
          stdio: 'ignore',
          windowsHide: true
        })
      } else {
        throw new Error(`Unknown target: ${target}`)
      }
    } else {
      throw new Error('Only supported on macOS, Linux (X11), and Windows')
    }
  })
}
