import { execSync } from 'child_process'
import { platform } from 'os'
import * as queries from './db-queries'
import type Database from 'better-sqlite3'

export interface NudgeOptions {
  taskId: number
  taskName: string
  success: boolean
  durationMs: number
  errorMessage?: string
}

// ─── macOS IDE Detection ─────────────────────────────────────

// Known IDE bundle identifiers that may host Claude Code (macOS)
const IDE_BUNDLE_IDS = [
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.microsoft.VSCode',
  'com.microsoft.VSCodeInsiders'
]

/**
 * Find the bundle ID of a running IDE that could host Claude Code (macOS).
 * Returns null if none found.
 */
function findIdeBundle(): string | null {
  for (const bid of IDE_BUNDLE_IDS) {
    try {
      execSync(
        `osascript -e 'tell application "System Events" to get first application process whose bundle identifier is "${bid}"'`,
        { timeout: 3000, stdio: 'ignore' }
      )
      return bid
    } catch { /* not running */ }
  }
  return null
}

// ─── Linux IDE Detection ─────────────────────────────────────

// IDE process names and their corresponding window title search terms
const LINUX_IDE_PROCESSES: Array<{ process: string; windowName: string }> = [
  { process: 'cursor', windowName: 'Cursor' },
  { process: 'code-insiders', windowName: 'Visual Studio Code' },
  { process: 'code', windowName: 'Visual Studio Code' }
]

/**
 * Find a running IDE process on Linux via pgrep.
 * Returns the window name to search for, or null if none found.
 */
export function findIdeProcessLinux(): { process: string; windowName: string } | null {
  for (const ide of LINUX_IDE_PROCESSES) {
    try {
      execSync(`pgrep -x "${ide.process}"`, { timeout: 3000, stdio: 'ignore' })
      return ide
    } catch { /* not running */ }
  }
  return null
}

// ─── Windows IDE Detection ──────────────────────────────────

// IDE process names as they appear in Windows Get-Process
const WINDOWS_IDE_PROCESSES: Array<{ process: string; windowTitle: string }> = [
  { process: 'Cursor', windowTitle: 'Cursor' },
  { process: 'Code - Insiders', windowTitle: 'Visual Studio Code' },
  { process: 'Code', windowTitle: 'Visual Studio Code' }
]

/**
 * Find a running IDE process on Windows via PowerShell Get-Process.
 * Returns the process name and window title, or null if none found.
 */
export function findIdeProcessWindows(): { process: string; windowTitle: string } | null {
  for (const ide of WINDOWS_IDE_PROCESSES) {
    try {
      const result = execSync(
        `powershell -NoProfile -Command "Get-Process '${ide.process}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 | ForEach-Object { $_.Id }"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim()
      if (result) return ide
    } catch { /* not running */ }
  }
  return null
}

/**
 * Escape special characters for WScript.Shell.SendKeys.
 * Characters +^%~(){}[] have special meaning and must be wrapped in braces.
 */
function escapeSendKeys(text: string): string {
  return text.replace(/([+^%~(){}[\]])/g, '{$1}')
}

// ─── Quiet Hours ─────────────────────────────────────────────

/**
 * Check if current time falls within configured quiet hours.
 * During quiet hours, nudges are suppressed to avoid interrupting user typing.
 */
export function isInQuietHours(db: Database.Database): boolean {
  try {
    if (queries.getSetting(db, 'auto_nudge_quiet_hours') !== 'true') return false
    const from = queries.getSetting(db, 'auto_nudge_quiet_from') ?? '08:00'
    const until = queries.getSetting(db, 'auto_nudge_quiet_until') ?? '22:00'
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const [fH, fM] = from.split(':').map(Number)
    const [uH, uM] = until.split(':').map(Number)
    const fromMinutes = fH * 60 + fM
    const untilMinutes = uH * 60 + uM
    if (fromMinutes <= untilMinutes) {
      // e.g., 08:00 to 22:00 — quiet during the day
      return currentMinutes >= fromMinutes && currentMinutes < untilMinutes
    } else {
      // e.g., 22:00 to 08:00 — quiet during the night (inverted)
      return currentMinutes >= fromMinutes || currentMinutes < untilMinutes
    }
  } catch {
    return false // Non-fatal: if settings read fails, don't block nudges
  }
}

// ─── Per-Task Nudge Decision ─────────────────────────────────

/**
 * Determine whether a task should trigger an auto-nudge based on its
 * nudge mode and success/failure status. Pure function — does not check quiet hours.
 */
export function shouldNudgeTask(nudgeMode: string, success: boolean): boolean {
  switch (nudgeMode) {
    case 'never': return false
    case 'failure_only': return !success
    default: return true // 'always' + unknown values
  }
}

// ─── Nudge Queue (serialize concurrent nudges) ──────────────

const nudgeQueue: NudgeOptions[] = []
let nudgeRunning = false
const NUDGE_GAP_MS = 3000

/**
 * Enqueue a nudge to be sent. Nudges are serialized so that if multiple
 * tasks complete at the same time, each gets its own separate message.
 */
export function enqueueNudge(options: NudgeOptions): void {
  nudgeQueue.push(options)
  processNudgeQueue()
}

async function processNudgeQueue(): Promise<void> {
  if (nudgeRunning || nudgeQueue.length === 0) return
  nudgeRunning = true
  try {
    while (nudgeQueue.length > 0) {
      const options = nudgeQueue.shift()!
      nudgeClaudeCode(options)
      if (nudgeQueue.length > 0) {
        await new Promise(r => setTimeout(r, NUDGE_GAP_MS))
      }
    }
  } finally {
    nudgeRunning = false
  }
}

// ─── Nudge Execution ─────────────────────────────────────────

/**
 * Build the nudge message text for a completed task.
 */
function buildNudgeMessage(options: NudgeOptions): string {
  const status = options.success ? 'completed successfully' : 'failed'
  const duration = (options.durationMs / 1000).toFixed(1)
  const safeName = options.taskName.replace(/[\x00-\x1f\x7f]/g, '')
  return `Daymon task "${safeName}" (id: ${options.taskId}) ${status} in ${duration}s. Show me the results using daymon_task_history.`
}

/**
 * Send a nudge via osascript on macOS.
 */
function nudgeMacOS(options: NudgeOptions): void {
  const ideBundle = findIdeBundle()
  if (!ideBundle) {
    console.error('[auto-nudge] No supported IDE found running')
    return
  }

  const message = buildNudgeMessage(options)
  const escaped = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const script = `
tell application id "${ideBundle}" to activate
delay 0.3
tell application "System Events"
  keystroke "l" using command down
  delay 0.3
  keystroke "${escaped}"
  keystroke return
end tell`

  console.error(`[auto-nudge] Sending nudge for task ${options.taskId} to ${ideBundle}...`)
  execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
    timeout: 10000,
    stdio: 'ignore'
  })
  console.error(`[auto-nudge] Nudge sent successfully`)
}

/**
 * Send a nudge via xdotool on Linux (X11 only).
 */
function nudgeLinux(options: NudgeOptions): void {
  // xdotool only works on X11
  if (process.env.XDG_SESSION_TYPE === 'wayland') {
    console.error('[auto-nudge] Wayland detected — xdotool not supported, skipping nudge')
    return
  }

  try {
    execSync('which xdotool', { timeout: 3000, stdio: 'ignore' })
  } catch {
    console.error('[auto-nudge] xdotool not installed, skipping nudge')
    return
  }

  const ide = findIdeProcessLinux()
  if (!ide) {
    console.error('[auto-nudge] No supported IDE found running')
    return
  }

  const message = buildNudgeMessage(options)

  // Find and activate IDE window, send Ctrl+L, type message, press Enter
  const wid = execSync(`xdotool search --name "${ide.windowName}" | head -1`, {
    encoding: 'utf-8',
    timeout: 5000
  }).trim()
  if (!wid) {
    console.error(`[auto-nudge] Could not find window for ${ide.windowName}`)
    return
  }

  console.error(`[auto-nudge] Sending nudge for task ${options.taskId} to ${ide.process} (wid ${wid})...`)
  execSync(`xdotool windowactivate --sync ${wid}`, { timeout: 5000, stdio: 'ignore' })
  execSync(`xdotool key --window ${wid} ctrl+l`, { timeout: 5000, stdio: 'ignore' })
  execSync('sleep 0.3', { timeout: 5000, stdio: 'ignore' })
  execSync(`xdotool type --window ${wid} --clearmodifiers -- ${JSON.stringify(message)}`, { timeout: 10000, stdio: 'ignore' })
  execSync(`xdotool key --window ${wid} Return`, { timeout: 5000, stdio: 'ignore' })
  console.error(`[auto-nudge] Nudge sent successfully`)
}

/**
 * Send a nudge via PowerShell on Windows (using WScript.Shell COM object).
 */
function nudgeWindows(options: NudgeOptions): void {
  const ide = findIdeProcessWindows()
  if (!ide) {
    console.error('[auto-nudge] No supported IDE found running')
    return
  }

  const message = buildNudgeMessage(options)
  const escaped = escapeSendKeys(message)

  // PowerShell script: find IDE, activate window, Ctrl+L, type message, Enter
  // Using WScript.Shell COM for SendKeys — available on all Windows versions
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
    '}'
  ].join(' ')

  console.error(`[auto-nudge] Sending nudge for task ${options.taskId} to ${ide.process}...`)
  execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
    timeout: 15000,
    stdio: 'ignore',
    windowsHide: true
  })
  console.error(`[auto-nudge] Nudge sent successfully`)
}

/**
 * Send a nudge message to the active Claude Code chat.
 * Uses osascript on macOS, xdotool on Linux (X11), PowerShell on Windows.
 * Non-fatal: all errors are logged to stderr but never throw.
 */
export function nudgeClaudeCode(options: NudgeOptions): void {
  const os = platform()
  if (os !== 'darwin' && os !== 'linux' && os !== 'win32') return

  try {
    if (os === 'darwin') {
      nudgeMacOS(options)
    } else if (os === 'linux') {
      nudgeLinux(options)
    } else {
      nudgeWindows(options)
    }
  } catch (err) {
    console.error(`[auto-nudge] Failed:`, err instanceof Error ? err.message : err)
  }
}
