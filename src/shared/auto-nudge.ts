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

// Known IDE bundle identifiers that may host Claude Code
const IDE_BUNDLE_IDS = [
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.microsoft.VSCode',
  'com.microsoft.VSCodeInsiders'
]

/**
 * Find the bundle ID of a running IDE that could host Claude Code.
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
 * Send a nudge message to the active Claude Code chat via osascript.
 * Activates the IDE, focuses Claude Code input (Cmd+L), types the message.
 * Non-fatal: all errors are logged to stderr but never throw.
 */
export function nudgeClaudeCode(options: NudgeOptions): void {
  if (platform() !== 'darwin') return

  try {
    const ideBundle = findIdeBundle()
    if (!ideBundle) {
      console.error('[auto-nudge] No supported IDE found running')
      return
    }

    const status = options.success ? 'completed successfully' : 'failed'
    const duration = (options.durationMs / 1000).toFixed(1)

    const safeName = options.taskName.replace(/[\x00-\x1f\x7f]/g, '')
    let message = `Daymon task "${safeName}" (id: ${options.taskId}) ${status} in ${duration}s.`
    message += ' Show me the results using daymon_task_history.'

    // Escape for AppleScript string: backslashes first, then double quotes
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
  } catch (err) {
    console.error(`[auto-nudge] Failed:`, err instanceof Error ? err.message : err)
  }
}
