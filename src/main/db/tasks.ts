import { getDatabase } from './index'
import * as queries from '../../shared/db-queries'
import { validateWatchPath } from '../../shared/watch-path'
import type { Task, TaskRun, CreateTaskInput, Watch, Worker, CreateWorkerInput } from '../../shared/types'

// ─── Workers ────────────────────────────────────────────────

export function createWorker(input: CreateWorkerInput): Worker {
  return queries.createWorker(getDatabase(), input)
}

export function getWorker(id: number): Worker | null {
  return queries.getWorker(getDatabase(), id)
}

export function listWorkers(): Worker[] {
  return queries.listWorkers(getDatabase())
}

export function getWorkerCount(): number {
  return queries.getWorkerCount(getDatabase())
}

export function updateWorker(id: number, updates: Partial<{
  name: string; systemPrompt: string; description: string; model: string; isDefault: boolean
}>): void {
  return queries.updateWorker(getDatabase(), id, updates)
}

export function deleteWorker(id: number): void {
  return queries.deleteWorker(getDatabase(), id)
}

export function getDefaultWorker(): Worker | null {
  return queries.getDefaultWorker(getDatabase())
}

// ─── Tasks ──────────────────────────────────────────────────

export function createTask(input: CreateTaskInput): Task {
  return queries.createTask(getDatabase(), input)
}

export function getTask(id: number): Task | null {
  return queries.getTask(getDatabase(), id)
}

export function listTasks(status?: string): Task[] {
  return queries.listTasks(getDatabase(), status)
}

export function updateTask(id: number, updates: Record<string, unknown>): void {
  return queries.updateTask(getDatabase(), id, updates)
}

export function deleteTask(id: number): void {
  return queries.deleteTask(getDatabase(), id)
}

export function pauseTask(id: number): void {
  return queries.pauseTask(getDatabase(), id)
}

export function resumeTask(id: number): void {
  return queries.resumeTask(getDatabase(), id)
}

// ─── Task Runs ──────────────────────────────────────────────

export function createTaskRun(taskId: number): TaskRun {
  return queries.createTaskRun(getDatabase(), taskId)
}

export function getTaskRun(id: number): TaskRun | null {
  return queries.getTaskRun(getDatabase(), id)
}

export function completeTaskRun(id: number, result: string, resultFile?: string, errorMessage?: string): void {
  return queries.completeTaskRun(getDatabase(), id, result, resultFile, errorMessage)
}

export function getTaskRuns(taskId: number, limit: number = 20): TaskRun[] {
  return queries.getTaskRuns(getDatabase(), taskId, limit)
}

export function getLatestTaskRun(taskId: number): TaskRun | null {
  return queries.getLatestTaskRun(getDatabase(), taskId)
}

export function listAllRuns(limit: number = 20): TaskRun[] {
  return queries.listAllRuns(getDatabase(), limit)
}

export function getDueOnceTasks(): Task[] {
  return queries.getDueOnceTasks(getDatabase())
}

export function updateTaskRunProgress(runId: number, progress: number | null, progressMessage: string | null): void {
  return queries.updateTaskRunProgress(getDatabase(), runId, progress, progressMessage)
}

export function getRunningTaskRuns(): TaskRun[] {
  return queries.getRunningTaskRuns(getDatabase())
}

// ─── Stale Run Cleanup ──────────────────────────────────────

export function cleanupStaleRuns(): number {
  return queries.cleanupStaleRuns(getDatabase())
}

export function pruneOldRuns(): number {
  return queries.pruneOldRuns(getDatabase())
}

// ─── Console Logs ───────────────────────────────────────────

export function getConsoleLogs(runId: number, afterSeq: number = 0, limit: number = 100) {
  return queries.getConsoleLogs(getDatabase(), runId, afterSeq, limit)
}

// ─── Watches ────────────────────────────────────────────────

export function createWatch(path: string, description?: string, actionPrompt?: string): Watch {
  const pathError = validateWatchPath(path)
  if (pathError) {
    throw new Error(`Invalid watch path: ${pathError}`)
  }
  return queries.createWatch(getDatabase(), path, description, actionPrompt)
}

export function getWatch(id: number): Watch | null {
  return queries.getWatch(getDatabase(), id)
}

export function listWatches(status?: string): Watch[] {
  return queries.listWatches(getDatabase(), status)
}

export function getWatchCount(status?: string): number {
  return queries.getWatchCount(getDatabase(), status)
}

export function deleteWatch(id: number): void {
  return queries.deleteWatch(getDatabase(), id)
}

// ─── Settings ───────────────────────────────────────────────

export function getSetting(key: string): string | null {
  return queries.getSetting(getDatabase(), key)
}

export function setSetting(key: string, value: string): void {
  return queries.setSetting(getDatabase(), key, value)
}

export function getAllSettings(): Record<string, string> {
  return queries.getAllSettings(getDatabase())
}
