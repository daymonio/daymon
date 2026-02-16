import { usePolling } from '../hooks/usePolling'
import type { Task, TaskRun } from '@shared/types'
import { formatRelativeTime } from '../utils/time'

interface StatusData {
  entityCount: number
  tasks: Task[]
  latestRun: TaskRun | null
  runningRuns: TaskRun[]
  scheduler: { running: boolean; jobCount: number }
  workerCount: number
  watchCount: number
}

async function fetchStatus(): Promise<StatusData> {
  if (!window.api?.memory || !window.api?.tasks || !window.api?.app) {
    throw new Error('IPC bridge is unavailable. Please restart Daymon.')
  }

  const [stats, tasks, runs, runningRuns, scheduler, workerCount, watchCount] = await Promise.all([
    window.api.memory.getStats(),
    window.api.tasks.list(),
    window.api.tasks.listAllRuns(1),
    window.api.tasks.getRunningRuns(),
    window.api.app.getSchedulerStatus(),
    window.api.workers.count(),
    window.api.watches.count()
  ])
  return {
    entityCount: stats.entityCount,
    tasks,
    latestRun: runs[0] ?? null,
    runningRuns,
    scheduler,
    workerCount,
    watchCount
  }
}

interface StatusPanelProps {
  onNavigate?: (tab: string) => void
  advancedMode: boolean
}

export function StatusPanel({ onNavigate, advancedMode }: StatusPanelProps): React.JSX.Element {
  const { data, error, isLoading } = usePolling(fetchStatus, 10000)

  if (isLoading && !data) {
    return <div className="p-4 text-xs text-gray-400">Loading...</div>
  }
  if (!data) {
    return <div className="p-4 text-xs text-red-500">{error ?? 'Failed to load status.'}</div>
  }

  const activeTasks = data.tasks.filter((t) => t.status === 'active')
  const pausedTasks = data.tasks.filter((t) => t.status === 'paused')
  const completedTasks = data.tasks.filter((t) => t.status === 'completed')

  return (
    <div className="p-4 space-y-3">
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Scheduler</span>
          <span className={`text-xs font-medium ${data.scheduler.running ? 'text-green-600' : 'text-red-500'}`}>
            {data.scheduler.running ? `Running (${data.scheduler.jobCount} cron)` : 'Stopped'}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-yellow-700 bg-yellow-50 rounded-lg">
          Temporary data refresh issue: {error}
        </div>
      )}

      {advancedMode && (
        <button
          className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          onClick={() => onNavigate?.('memory')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Memory</span>
            <span className="text-xs text-gray-500">{data.entityCount} entities</span>
          </div>
        </button>
      )}

      <button
        className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        onClick={() => onNavigate?.('workers')}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">Workers</span>
          <span className="text-xs text-gray-500">{data.workerCount} configured</span>
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

      {advancedMode && (
        <button
          className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          onClick={() => onNavigate?.('watches')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Watches</span>
            <span className="text-xs text-gray-500">{data.watchCount} active</span>
          </div>
        </button>
      )}

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
            {formatRelativeTime(data.latestRun.startedAt)}
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

      <button
        className="w-full text-left p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors cursor-pointer"
        onClick={() => window.open('https://github.com/daymonio/daymon')}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">&#11088;</span>
          <span className="text-xs font-medium text-yellow-700">Star Daymon on GitHub</span>
        </div>
      </button>
    </div>
  )
}
