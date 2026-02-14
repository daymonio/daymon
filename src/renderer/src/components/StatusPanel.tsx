import { usePolling } from '../hooks/usePolling'
import type { Task, TaskRun } from '@shared/types'

interface StatusData {
  entityCount: number
  tasks: Task[]
  latestRun: TaskRun | null
  runningRuns: TaskRun[]
}

async function fetchStatus(): Promise<StatusData> {
  const [stats, tasks, runs, runningRuns] = await Promise.all([
    window.api.memory.getStats(),
    window.api.tasks.list(),
    window.api.tasks.listAllRuns(1),
    window.api.tasks.getRunningRuns()
  ])
  return {
    entityCount: stats.entityCount,
    tasks,
    latestRun: runs[0] ?? null,
    runningRuns
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 60000) return 'just now'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`
  return d.toLocaleDateString()
}

export function StatusPanel({ onNavigate }: { onNavigate?: (tab: string) => void }): React.JSX.Element {
  const { data } = usePolling(fetchStatus, 3000)

  if (!data) {
    return <div className="p-4 text-xs text-gray-400">Loading...</div>
  }

  const activeTasks = data.tasks.filter((t) => t.status === 'active')
  const pausedTasks = data.tasks.filter((t) => t.status === 'paused')
  const completedTasks = data.tasks.filter((t) => t.status === 'completed')

  return (
    <div className="p-4 space-y-3">
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Scheduler</span>
          <span className="text-xs text-green-600 font-medium">Running</span>
        </div>
      </div>

      <button
        className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        onClick={() => onNavigate?.('memory')}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Memory</span>
          <span className="text-xs text-gray-500">{data.entityCount} entities</span>
        </div>
      </button>

      <button
        className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        onClick={() => onNavigate?.('tasks')}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-600">Tasks</span>
          <span className="text-xs text-gray-500">{data.tasks.length} total</span>
        </div>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="text-green-600">{activeTasks.length} active</span>
          {pausedTasks.length > 0 && (
            <span className="text-yellow-600">{pausedTasks.length} paused</span>
          )}
          {completedTasks.length > 0 && (
            <span className="text-blue-600">{completedTasks.length} completed</span>
          )}
        </div>
      </button>

      {data.runningRuns.length > 0 && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="text-xs font-medium text-blue-700 mb-1">
            Running ({data.runningRuns.length})
          </div>
          {data.runningRuns.map((run) => (
            <div key={run.id} className="mb-1 last:mb-0">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
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
                <div className="text-xs text-blue-600 mt-0.5 truncate">{run.progressMessage}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        onClick={() => onNavigate?.('results')}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-600">Last Run</span>
        </div>
        {data.latestRun ? (
          <div className="text-xs text-gray-500">
            <span
              className={
                data.latestRun.status === 'completed'
                  ? 'text-green-600'
                  : data.latestRun.status === 'running'
                    ? 'text-blue-600'
                    : 'text-red-500'
              }
            >
              {data.latestRun.status}
            </span>
            {' — '}
            {formatTime(data.latestRun.startedAt)}
            {data.latestRun.durationMs != null && (
              <span className="text-gray-400">
                {' '}
                ({(data.latestRun.durationMs / 1000).toFixed(1)}s)
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">No runs yet</span>
        )}
      </button>
    </div>
  )
}
