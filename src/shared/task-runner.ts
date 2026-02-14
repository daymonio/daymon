import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { executeClaudeCode } from './claude-code'
import * as queries from './db-queries'
import { DEFAULTS } from './constants'
import type Database from 'better-sqlite3'
import type { Task } from './types'

export interface TaskExecutionOptions {
  db: Database.Database
  resultsDir: string
  onComplete?: (task: Task, output: string) => void
  onFailed?: (task: Task, error: string) => void
}

export interface TaskExecutionResult {
  success: boolean
  output: string
  errorMessage?: string
  durationMs: number
  resultFilePath?: string
}

const runningTasks = new Set<number>()

export function isTaskRunning(taskId: number): boolean {
  return runningTasks.has(taskId)
}

export async function executeTask(
  taskId: number,
  options: TaskExecutionOptions
): Promise<TaskExecutionResult> {
  const { db, resultsDir, onComplete, onFailed } = options

  if (runningTasks.has(taskId)) {
    return { success: false, output: '', errorMessage: 'Task is already running', durationMs: 0 }
  }

  // Cross-process safety: check DB for an existing running execution
  const existingRun = queries.getLatestTaskRun(db, taskId)
  if (existingRun?.status === 'running') {
    return { success: false, output: '', errorMessage: 'Task has a running execution in another process', durationMs: 0 }
  }

  const task = queries.getTask(db, taskId)
  if (!task) {
    return { success: false, output: '', errorMessage: `Task ${taskId} not found`, durationMs: 0 }
  }

  if (task.status !== 'active') {
    return { success: false, output: '', errorMessage: `Task ${taskId} is ${task.status}, not active`, durationMs: 0 }
  }

  runningTasks.add(taskId)
  const run = queries.createTaskRun(db, taskId)

  try {
    let lastProgressUpdate = 0
    const result = await executeClaudeCode(task.prompt, undefined, (progress) => {
      const now = Date.now()
      if (now - lastProgressUpdate >= DEFAULTS.PROGRESS_THROTTLE_MS) {
        queries.updateTaskRunProgress(db, run.id, progress.fraction, progress.message)
        lastProgressUpdate = now
      }
    })

    const output = result.stdout || result.stderr || '(no output)'
    const resultFilePath = saveResult(resultsDir, task.name, output, result)

    if (result.exitCode === 0 && !result.timedOut) {
      queries.completeTaskRun(db, run.id, output, resultFilePath)
      onComplete?.(task, output.slice(0, 200))
      return { success: true, output, durationMs: result.durationMs, resultFilePath }
    } else {
      const errorMsg = result.timedOut
        ? `Timed out after ${result.durationMs}ms`
        : `Exit code ${result.exitCode}: ${result.stderr || '(no stderr)'}`
      queries.completeTaskRun(db, run.id, output, resultFilePath, errorMsg)
      onFailed?.(task, errorMsg)
      return { success: false, output, errorMessage: errorMsg, durationMs: result.durationMs, resultFilePath }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    queries.completeTaskRun(db, run.id, '', undefined, errorMsg)
    onFailed?.(task, errorMsg)
    return { success: false, output: '', errorMessage: errorMsg, durationMs: 0 }
  } finally {
    runningTasks.delete(taskId)
  }
}

function saveResult(
  resultsDir: string,
  taskName: string,
  output: string,
  result: { exitCode: number; durationMs: number; timedOut: boolean }
): string {
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true })
  }

  const safeName = taskName.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${safeName}-${timestamp}.md`
  const filePath = join(resultsDir, fileName)

  const markdown = `# Task: ${taskName}

**Date:** ${new Date().toLocaleString()}
**Duration:** ${(result.durationMs / 1000).toFixed(1)}s
**Status:** ${result.timedOut ? 'Timed Out' : result.exitCode === 0 ? 'Success' : `Failed (exit ${result.exitCode})`}

---

${output}
`

  writeFileSync(filePath, markdown, 'utf-8')
  return filePath
}
