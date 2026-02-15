import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import { listWatches } from './db/tasks'
import { getDatabase } from './db'
import { executeClaudeCode } from '../shared/claude-code'
import type { Watch } from '../shared/types'

const activeWatchers = new Map<number, FSWatcher>()

export function startWatch(watch: Watch): void {
  if (activeWatchers.has(watch.id)) return
  if (!watch.actionPrompt) {
    console.log(`Watch ${watch.id} (${watch.path}) has no action prompt, skipping`)
    return
  }

  const watcher = chokidarWatch(watch.path, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 }
  })

  const actionPrompt = watch.actionPrompt

  watcher.on('add', (filePath) => {
    console.log(`Watch ${watch.id}: new file ${filePath}`)
    handleTrigger(watch.id, actionPrompt, filePath)
  })

  watcher.on('change', (filePath) => {
    console.log(`Watch ${watch.id}: changed ${filePath}`)
    handleTrigger(watch.id, actionPrompt, filePath)
  })

  watcher.on('error', (err: unknown) => {
    console.error(`Watch ${watch.id} error:`, err instanceof Error ? err.message : err)
  })

  activeWatchers.set(watch.id, watcher)
  console.log(`Started file watch ${watch.id} on ${watch.path}`)
}

export function stopWatch(id: number): void {
  const watcher = activeWatchers.get(id)
  if (watcher) {
    watcher.close()
    activeWatchers.delete(id)
    console.log(`Stopped file watch ${id}`)
  }
}

export function startAllWatches(): void {
  const watches = listWatches('active')
  for (const watch of watches) {
    startWatch(watch)
  }
  if (watches.length > 0) {
    console.log(`Started ${watches.length} file watcher(s)`)
  }
}

export function stopAllWatches(): void {
  for (const [id, watcher] of activeWatchers) {
    watcher.close()
    console.log(`Stopped file watch ${id}`)
  }
  activeWatchers.clear()
}

// Debounce triggers per watch to avoid rapid re-execution
const lastTrigger = new Map<number, number>()
const DEBOUNCE_MS = 10000

async function handleTrigger(watchId: number, actionPrompt: string, filePath: string): Promise<void> {
  const now = Date.now()
  const last = lastTrigger.get(watchId) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastTrigger.set(watchId, now)

  // Update trigger stats in DB
  try {
    const db = getDatabase()
    db.prepare('UPDATE watches SET last_triggered = CURRENT_TIMESTAMP, trigger_count = trigger_count + 1 WHERE id = ?').run(watchId)
  } catch {
    // non-fatal
  }

  // Quote the file path to prevent prompt injection via crafted filenames
  const safeFilePath = JSON.stringify(filePath)
  const prompt = `${actionPrompt}\n\nTriggered by file change. File path: ${safeFilePath}`
  console.log(`Watch ${watchId} executing action for ${filePath}`)

  try {
    const result = await executeClaudeCode(prompt)
    if (result.exitCode === 0) {
      console.log(`Watch ${watchId} action completed in ${result.durationMs}ms`)
    } else {
      console.error(`Watch ${watchId} action failed: exit ${result.exitCode}`)
    }
  } catch (err) {
    console.error(`Watch ${watchId} action error:`, err)
  }
}
