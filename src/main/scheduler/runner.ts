import { getDatabase } from '../db'
import { getConfig } from '../config'
import { notifyTaskComplete, notifyTaskFailed } from '../notifications'
import { executeTask as sharedExecuteTask } from '../../shared/task-runner'

export async function executeTask(taskId: number): Promise<void> {
  const config = getConfig()
  const db = getDatabase()

  const result = await sharedExecuteTask(taskId, {
    db,
    resultsDir: config.resultsDir,
    onComplete: (task, output, durationMs) => {
      console.log(`Task ${taskId} (${task.name}) completed in ${durationMs}ms`)
      notifyTaskComplete(task.name, output)
    },
    onFailed: (task, error) => {
      console.error(`Task ${taskId} (${task.name}) failed: ${error}`)
      notifyTaskFailed(task.name, error)
    }
  })

  if (!result.success && result.errorMessage) {
    console.log(`Task ${taskId}: ${result.errorMessage}`)
  }
}
