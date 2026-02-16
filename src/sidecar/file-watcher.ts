/**
 * File watcher — uses native fs.watch() with { recursive: true } on macOS.
 * This leverages FSEvents (1 FD per watched path) instead of per-file kqueue
 * watchers, preventing FD exhaustion on large directories.
 */

import { watch as fsWatch, type FSWatcher, existsSync, statSync } from 'fs'
import { join, relative } from 'path'
import type Database from 'better-sqlite3'
import * as queries from '../shared/db-queries'
import { executeClaudeCode } from '../shared/claude-code'
import type { Watch } from '../shared/types'

let db: Database.Database

const activeWatchers = new Map<number, FSWatcher>()
let syncTimer: ReturnType<typeof setInterval> | null = null
const WATCH_SYNC_INTERVAL_MS = 30_000
let lastLoggedWatchCount: number | null = null

export function startAllWatches(database: Database.Database): void {
  db = database
  if (syncTimer) clearInterval(syncTimer)
  syncWatchesWithDatabase()
  syncTimer = setInterval(syncWatchesWithDatabase, WATCH_SYNC_INTERVAL_MS)
}

export function stopAllWatches(): void {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
  for (const [id, watcher] of activeWatchers) {
    watcher.close()
    console.log(`Sidecar: Stopped file watch ${id}`)
  }
  activeWatchers.clear()
  lastLoggedWatchCount = null
}

export function syncWatches(): void {
  syncWatchesWithDatabase()
}

function startWatch(watch: Watch): void {
  if (activeWatchers.has(watch.id)) return
  if (!watch.actionPrompt) {
    console.log(`Sidecar: Watch ${watch.id} (${watch.path}) has no action prompt, skipping`)
    return
  }

  if (!existsSync(watch.path)) {
    console.log(`Sidecar: Watch ${watch.id} path does not exist: ${watch.path}`)
    return
  }

  const actionPrompt = watch.actionPrompt
  const isDir = statSync(watch.path).isDirectory()

  try {
    // Use recursive: true on macOS — leverages FSEvents (1 FD) instead of per-file kqueue
    const watcher = fsWatch(watch.path, { recursive: isDir }, (eventType, filename) => {
      if (!filename) return
      const filePath = isDir ? join(watch.path, filename) : watch.path

      // Limit depth to 1 (direct children + 1 level of subdirectories)
      if (isDir) {
        const rel = relative(watch.path, filePath)
        const depth = rel.split('/').length
        if (depth > 2) return
      }

      handleTrigger(watch.id, actionPrompt, filePath)
    })

    watcher.on('error', (err: unknown) => {
      console.error(`Sidecar: Watch ${watch.id} error:`, err instanceof Error ? err.message : err)
    })

    activeWatchers.set(watch.id, watcher)
    console.log(`Sidecar: Started file watch ${watch.id} on ${watch.path}`)
  } catch (err) {
    console.error(`Sidecar: Failed to start watch ${watch.id}:`, err instanceof Error ? err.message : err)
  }
}

function stopWatch(id: number): void {
  const watcher = activeWatchers.get(id)
  if (watcher) {
    watcher.close()
    activeWatchers.delete(id)
    console.log(`Sidecar: Stopped file watch ${id}`)
  }
}

// Debounce triggers per watch + per file
const lastTrigger = new Map<string, number>()
const DEBOUNCE_MS = 10000

async function handleTrigger(watchId: number, actionPrompt: string, filePath: string): Promise<void> {
  const key = `${watchId}:${filePath}`
  const now = Date.now()
  const last = lastTrigger.get(key) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastTrigger.set(key, now)

  console.log(`Sidecar: Watch ${watchId}: change detected ${filePath}`)

  try {
    db.prepare("UPDATE watches SET last_triggered = datetime('now','localtime'), trigger_count = trigger_count + 1 WHERE id = ?").run(watchId)
  } catch { /* non-fatal */ }

  const safeFilePath = JSON.stringify(filePath)
  const prompt = `${actionPrompt}\n\nTriggered by file change. File path: ${safeFilePath}`
  console.log(`Sidecar: Watch ${watchId} executing action for ${filePath}`)

  try {
    const result = await executeClaudeCode(prompt)
    if (result.exitCode === 0) {
      console.log(`Sidecar: Watch ${watchId} action completed in ${result.durationMs}ms`)
    } else {
      console.error(`Sidecar: Watch ${watchId} action failed: exit ${result.exitCode}`)
    }
  } catch (err) {
    console.error(`Sidecar: Watch ${watchId} action error:`, err)
  }
}

function syncWatchesWithDatabase(): void {
  const activeWatches = queries.listWatches(db, 'active')
  const activeIds = new Set(activeWatches.map((watch) => watch.id))

  for (const [watchId] of activeWatchers) {
    if (!activeIds.has(watchId)) stopWatch(watchId)
  }

  for (const watch of activeWatches) {
    if (!activeWatchers.has(watch.id)) startWatch(watch)
  }

  if (lastLoggedWatchCount !== activeWatches.length) {
    console.log(`Sidecar: File watchers synced: ${activeWatches.length} active watch(es)`)
    lastLoggedWatchCount = activeWatches.length
  }
}
