import { execSync } from 'child_process'
import { platform } from 'os'

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

    let message = `Daymon task "${options.taskName}" (id: ${options.taskId}) ${status} in ${duration}s.`
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
