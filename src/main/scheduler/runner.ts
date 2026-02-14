import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { getTask, createTaskRun, completeTaskRun, updateTaskRunProgress } from '../db/tasks'
import { executeClaudeCode } from '../executor/claude-code'
import { getConfig } from '../config'
import { notifyTaskComplete, notifyTaskFailed } from '../notifications'
import { DEFAULTS } from '../../shared/constants'

const runningTasks = new Set<number>()

export async function executeTask(taskId: number): Promise<void> {
  if (runningTasks.has(taskId)) {
    console.log(`Task ${taskId} is already running, skipping`)
    return
  }

  const task = getTask(taskId)
  if (!task) {
    console.error(`Task ${taskId} not found`)
    return
  }

  if (task.status !== 'active') {
    console.log(`Task ${taskId} (${task.name}) is ${task.status}, skipping`)
    return
  }

  runningTasks.add(taskId)
  console.log(`Executing task ${taskId}: ${task.name}`)

  const run = createTaskRun(taskId)

  try {
    let lastProgressUpdate = 0
    const result = await executeClaudeCode(task.prompt, undefined, (progress) => {
      const now = Date.now()
      if (now - lastProgressUpdate >= DEFAULTS.PROGRESS_THROTTLE_MS) {
        updateTaskRunProgress(run.id, progress.fraction, progress.message)
        lastProgressUpdate = now
      }
    })

    const output = result.stdout || result.stderr || '(no output)'
    const resultFilePath = saveResult(task.name, output, result)

    if (result.exitCode === 0 && !result.timedOut) {
      completeTaskRun(run.id, output, resultFilePath)
      console.log(`Task ${taskId} (${task.name}) completed in ${result.durationMs}ms`)
      notifyTaskComplete(task.name, output.slice(0, 200))
    } else {
      const errorMsg = result.timedOut
        ? `Timed out after ${result.durationMs}ms`
        : `Exit code ${result.exitCode}: ${result.stderr || '(no stderr)'}`
      completeTaskRun(run.id, output, resultFilePath, errorMsg)
      console.error(`Task ${taskId} (${task.name}) failed: ${errorMsg}`)
      notifyTaskFailed(task.name, errorMsg)
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    completeTaskRun(run.id, '', undefined, errorMsg)
    console.error(`Task ${taskId} (${task.name}) error: ${errorMsg}`)
    notifyTaskFailed(task.name, errorMsg)
  } finally {
    runningTasks.delete(taskId)
  }
}

function saveResult(taskName: string, output: string, result: { exitCode: number; durationMs: number; timedOut: boolean }): string {
  const config = getConfig()
  const resultsDir = config.resultsDir

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

export function isTaskRunning(taskId: number): boolean {
  return runningTasks.has(taskId)
}
