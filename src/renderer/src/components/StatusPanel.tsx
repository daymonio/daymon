import { useState, useEffect } from 'react'
import { usePolling } from '../hooks/usePolling'
import { useContainerWidth } from '../hooks/useContainerWidth'
import { AnalogClock } from './AnalogClock'
import { LiveConsoleSection } from './LiveConsoleSection'
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

const cardClass =
  'w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer'

interface StatusPanelProps {
  onNavigate?: (tab: string) => void
  advancedMode: boolean
}

export function StatusPanel({ onNavigate, advancedMode }: StatusPanelProps): React.JSX.Element {
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  const wide = containerWidth >= 600
  const { data, error, isLoading } = usePolling(fetchStatus, 10000)
  const [updateStatus, setUpdateStatus] = useState<{ status: string; version?: string; progress?: number } | null>(null)

  useEffect(() => {
    window.api.app.getUpdateStatus().then(setUpdateStatus)
    const poll = setInterval(() => window.api.app.getUpdateStatus().then(setUpdateStatus), 30000)
    return () => clearInterval(poll)
  }, [])

  if (isLoading && !data) {
    return <div ref={containerRef} className="p-4 text-xs text-gray-400">Loading...</div>
  }
  if (!data) {
    return (
      <div ref={containerRef} className="p-4 text-xs text-red-500">
        {error ?? 'Failed to load status.'}
      </div>
    )
  }

  const activeTasks = data.tasks.filter((t) => t.status === 'active')
  const pausedTasks = data.tasks.filter((t) => t.status === 'paused')
  const completedTasks = data.tasks.filter((t) => t.status === 'completed')

  const schedulerCard = (
    <div key="scheduler" className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Scheduler</span>
        <span
          className={`text-xs font-medium ${data.scheduler.running ? 'text-green-600' : 'text-red-500'}`}
        >
          {data.scheduler.running ? `Running (${data.scheduler.jobCount} cron)` : 'Stopped'}
        </span>
      </div>
    </div>
  )

  const memoryCard = advancedMode ? (
    <button key="memory" className={cardClass} onClick={() => onNavigate?.('memory')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Memory</span>
        <span className="text-xs text-gray-500">{data.entityCount} entities</span>
      </div>
    </button>
  ) : null

  const workersCard = (
    <button key="workers" className={cardClass} onClick={() => onNavigate?.('workers')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Workers</span>
        <span className="text-xs text-gray-500">{data.workerCount} configured</span>
      </div>
    </button>
  )

  const tasksCard = (
    <button key="tasks" className={cardClass} onClick={() => onNavigate?.('tasks')}>
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
  )

  const watchesCard = advancedMode ? (
    <button key="watches" className={cardClass} onClick={() => onNavigate?.('watches')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Watches</span>
        <span className="text-xs text-gray-500">{data.watchCount} active</span>
      </div>
    </button>
  ) : null

  const lastRunCard = (
    <button key="lastrun" className={cardClass} onClick={() => onNavigate?.('results')}>
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
  )

  const runningSection =
    data.runningRuns.length > 0 ? (
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
    ) : null

  const taskNames: Record<number, string> = {}
  for (const t of data.tasks) taskNames[t.id] = t.name

  const consoleSection = (
    <LiveConsoleSection runningRuns={data.runningRuns} taskNames={taskNames} />
  )

  const errorAlert = error ? (
    <div className="px-3 py-2 text-xs text-yellow-700 bg-yellow-50 rounded-lg">
      Temporary data refresh issue: {error}
    </div>
  ) : null

  async function handleDownload(): Promise<void> {
    await window.api.app.downloadUpdate()
    const poll = setInterval(async () => {
      const s = await window.api.app.getUpdateStatus()
      setUpdateStatus(s)
      if (s.status !== 'downloading') clearInterval(poll)
    }, 500)
  }

  const updateCard = (updateStatus?.status === 'available' || updateStatus?.status === 'downloading' || updateStatus?.status === 'ready') ? (
    <div key="update" className="w-full p-3 bg-green-50 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-green-700">
          {updateStatus.status === 'available' && `Update v${updateStatus.version} available`}
          {updateStatus.status === 'downloading' && `Downloading${updateStatus.progress != null ? ` ${updateStatus.progress}%` : '...'}`}
          {updateStatus.status === 'ready' && 'Update ready'}
        </span>
        {updateStatus.status === 'available' && (
          <button onClick={handleDownload} className="text-xs text-green-600 hover:text-green-800 font-medium">Download</button>
        )}
        {updateStatus.status === 'ready' && (
          <button onClick={() => window.api.app.installUpdate()} className="text-xs text-green-600 hover:text-green-800 font-medium">Install &amp; Restart</button>
        )}
      </div>
    </div>
  ) : null

  const githubCta = (
    <button
      className="w-full text-left p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors cursor-pointer"
      onClick={() => window.open('https://github.com/daymonio/daymon')}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">&#11088;</span>
        <span className="text-xs font-medium text-yellow-700">Star us on GitHub</span>
      </div>
      <div className="text-xs text-yellow-600 mt-0.5">
        Free &amp; open source — a star helps others discover Daymon
      </div>
    </button>
  )

  if (!wide) {
    return (
      <div ref={containerRef} className="p-4 flex flex-col gap-3 min-h-full">
        {schedulerCard}
        {errorAlert}
        {memoryCard}
        {workersCard}
        {tasksCard}
        {watchesCard}
        {runningSection}
        {updateCard}
        {consoleSection}
        {lastRunCard}
        {githubCta}
      </div>
    )
  }

  const cards = [schedulerCard, memoryCard, workersCard, tasksCard, watchesCard, lastRunCard].filter(
    Boolean
  )

  return (
    <div ref={containerRef} className="p-4 flex gap-6 min-h-full">
      <div className="flex-1 flex flex-col gap-3">
        {errorAlert}
        <div className="grid grid-cols-2 gap-3">{cards}</div>
        {runningSection}
        {updateCard}
        {consoleSection}
        {githubCta}
      </div>
      <div className="flex flex-col items-center pt-4 w-[200px] shrink-0">
        <AnalogClock size={160} />
      </div>
    </div>
  )
}
