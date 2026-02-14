import { usePolling } from '../hooks/usePolling'
import type { Task, TaskRun, Worker } from '@shared/types'

function statusBadge(task: Task): React.JSX.Element {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    error: 'bg-red-100 text-red-700'
  }
  const cls = colors[task.status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${cls}`}>
      {task.status}
      {task.errorCount > 0 && ` (${task.errorCount})`}
    </span>
  )
}

function triggerLabel(task: Task): string {
  if (task.triggerType === 'cron' && task.cronExpression) return task.cronExpression
  if (task.triggerType === 'once' && task.scheduledAt) {
    return `Once: ${new Date(task.scheduledAt).toLocaleString()}`
  }
  if (task.triggerType === 'manual') return 'On-demand'
  return task.triggerType
}

function sourceLabel(task: Task): string | null {
  if (!task.triggerConfig) return null
  try {
    const config = JSON.parse(task.triggerConfig)
    if (config.source === 'claude-code') return 'Claude Code'
    if (config.source === 'claude-desktop') return 'Claude Desktop'
    if (config.source === 'daymon') return 'Daymon'
    return config.source
  } catch {
    return null
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 60000) return 'just now'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`
  return d.toLocaleDateString()
}

function ProgressBar({ run }: { run: TaskRun }): React.JSX.Element {
  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          {run.progress != null ? (
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(run.progress * 100)}%` }}
            />
          ) : (
            <div className="h-full bg-blue-400 rounded-full animate-pulse w-full" />
          )}
        </div>
      </div>
      {run.progressMessage && (
        <div className="text-xs text-blue-500 mt-0.5 truncate">
          {run.progressMessage}
        </div>
      )}
    </div>
  )
}

export function TasksPanel(): React.JSX.Element {
  const { data: tasks, refresh } = usePolling(() => window.api.tasks.list(), 5000)
  const { data: runningRuns } = usePolling(() => window.api.tasks.getRunningRuns(), 2000)
  const { data: workers } = usePolling(() => window.api.workers.list(), 10000)

  const workerMap = new Map<number, Worker>()
  if (workers) {
    for (const w of workers) workerMap.set(w.id, w)
  }

  const runningByTaskId = new Map<number, TaskRun>()
  if (runningRuns) {
    for (const run of runningRuns) {
      if (!runningByTaskId.has(run.taskId)) {
        runningByTaskId.set(run.taskId, run)
      }
    }
  }

  async function togglePause(task: Task): Promise<void> {
    if (task.status === 'paused') {
      await window.api.tasks.resume(task.id)
    } else {
      await window.api.tasks.pause(task.id)
    }
    refresh()
  }

  async function deleteTask(id: number): Promise<void> {
    await window.api.tasks.delete(id)
    refresh()
  }

  async function runNow(id: number): Promise<void> {
    await window.api.tasks.runNow(id)
    refresh()
  }

  if (!tasks) {
    return <div className="p-4 text-xs text-gray-400">Loading...</div>
  }

  if (tasks.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-gray-400">
        No tasks yet. Use Claude to schedule tasks via MCP.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {tasks.map((task) => {
        const activeRun = runningByTaskId.get(task.id)
        return (
          <div key={task.id} className="px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-800 truncate">{task.name}</span>
              {statusBadge(task)}
            </div>
            <div className="text-xs text-gray-400 mb-1">
              {triggerLabel(task)}
              {task.maxRuns != null && (
                <span className="ml-1.5 text-gray-500">
                  {task.runCount} / {task.maxRuns} runs
                </span>
              )}
              {sourceLabel(task) && (
                <span className="ml-1.5 text-gray-300">
                  via {sourceLabel(task)}
                </span>
              )}
              {task.workerId != null && workerMap.get(task.workerId) && (
                <span className="ml-1.5 text-purple-400">
                  {workerMap.get(task.workerId)!.name}
                </span>
              )}
              {task.sessionContinuity && (
                <span className="ml-1.5 px-1 py-0.5 rounded bg-violet-100 text-violet-600">
                  continuous
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mb-1.5">
              Last run: {formatTime(task.lastRun)}
            </div>
            {activeRun && <ProgressBar run={activeRun} />}
            <div className="flex gap-2">
              <button
                onClick={() => runNow(task.id)}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                Run Now
              </button>
              {task.status !== 'completed' && (
                <button
                  onClick={() => togglePause(task)}
                  className="text-xs text-yellow-600 hover:text-yellow-800"
                >
                  {task.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
              )}
              <button
                onClick={() => deleteTask(task.id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
