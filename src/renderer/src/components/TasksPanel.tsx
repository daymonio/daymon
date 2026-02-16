import { usePolling } from '../hooks/usePolling'
import type { Task, TaskRun, Worker, ConsoleLogEntry } from '@shared/types'
import { formatRelativeTime } from '../utils/time'
import { useState, useEffect, useRef } from 'react'

type StatusFilter = 'all' | 'active' | 'paused' | 'completed'
type TriggerFilter = 'all' | 'cron' | 'once' | 'manual'

interface TaskFilters {
  status: StatusFilter
  trigger: TriggerFilter
  search: string
}

// Module-level persistence: survives component unmounts during tab switches
let persistedFilters: TaskFilters = {
  status: 'all',
  trigger: 'all',
  search: ''
}

function FilterPill({
  label,
  active,
  onClick,
  colorClass
}: {
  label: string
  active: boolean
  onClick: () => void
  colorClass?: string
}): React.JSX.Element {
  const base = 'px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors'
  const activeStyle = colorClass ?? 'bg-gray-700 text-white'
  const inactiveStyle = 'bg-gray-100 text-gray-500 hover:bg-gray-200'
  return (
    <button
      onClick={onClick}
      className={`${base} ${active ? activeStyle : inactiveStyle}`}
    >
      {label}
    </button>
  )
}

function FilterBar({
  filters,
  onChange,
  advancedMode,
  taskCounts
}: {
  filters: TaskFilters
  onChange: (filters: TaskFilters) => void
  advancedMode: boolean
  taskCounts: { all: number; active: number; paused: number; completed: number }
}): React.JSX.Element {
  return (
    <div className="px-3 py-2 border-b border-gray-200 space-y-1.5">
      <div className="flex items-center gap-1">
        <FilterPill
          label={`All (${taskCounts.all})`}
          active={filters.status === 'all'}
          onClick={() => onChange({ ...filters, status: 'all' })}
        />
        <FilterPill
          label={`Active (${taskCounts.active})`}
          active={filters.status === 'active'}
          onClick={() => onChange({ ...filters, status: 'active' })}
          colorClass="bg-green-100 text-green-700"
        />
        <FilterPill
          label={`Paused (${taskCounts.paused})`}
          active={filters.status === 'paused'}
          onClick={() => onChange({ ...filters, status: 'paused' })}
          colorClass="bg-yellow-100 text-yellow-700"
        />
        <FilterPill
          label={`Done (${taskCounts.completed})`}
          active={filters.status === 'completed'}
          onClick={() => onChange({ ...filters, status: 'completed' })}
          colorClass="bg-blue-100 text-blue-700"
        />
      </div>

      {advancedMode && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-0.5">Type:</span>
          <FilterPill
            label="All"
            active={filters.trigger === 'all'}
            onClick={() => onChange({ ...filters, trigger: 'all' })}
          />
          <FilterPill
            label="Cron"
            active={filters.trigger === 'cron'}
            onClick={() => onChange({ ...filters, trigger: 'cron' })}
          />
          <FilterPill
            label="Once"
            active={filters.trigger === 'once'}
            onClick={() => onChange({ ...filters, trigger: 'once' })}
          />
          <FilterPill
            label="Manual"
            active={filters.trigger === 'manual'}
            onClick={() => onChange({ ...filters, trigger: 'manual' })}
          />
        </div>
      )}

      {advancedMode && (
        <input
          type="text"
          placeholder="Search tasks..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
        />
      )}
    </div>
  )
}

function filterTasks(tasks: Task[], filters: TaskFilters): Task[] {
  let result = tasks

  if (filters.status !== 'all') {
    result = result.filter((t) => t.status === filters.status)
  }

  if (filters.trigger !== 'all') {
    result = result.filter((t) => t.triggerType === filters.trigger)
  }

  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase()
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false)
    )
  }

  return result
}

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

const CONSOLE_ENTRY_COLORS: Record<string, string> = {
  tool_call: 'text-yellow-400',
  assistant_text: 'text-green-300',
  tool_result: 'text-gray-400',
  result: 'text-blue-400',
  error: 'text-red-400'
}

function ConsoleView({ runId }: { runId: number }): React.JSX.Element {
  const [entries, setEntries] = useState<ConsoleLogEntry[]>([])
  const lastSeqRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    lastSeqRef.current = 0
    setEntries([])

    const poll = async (): Promise<void> => {
      if (!mounted) return
      try {
        const newEntries = await window.api.tasks.getConsoleLogs(runId, lastSeqRef.current, 50)
        if (newEntries.length > 0 && mounted) {
          lastSeqRef.current = newEntries[newEntries.length - 1].seq
          setEntries(prev => [...prev.slice(-150), ...newEntries])
        }
      } catch {
        // non-fatal
      }
    }
    poll()
    const timer = setInterval(poll, 3000)
    return () => { mounted = false; clearInterval(timer) }
  }, [runId])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [entries])

  return (
    <div
      ref={scrollRef}
      className="max-h-48 overflow-y-auto bg-gray-900 rounded p-2 mt-1 font-mono text-xs leading-relaxed"
    >
      {entries.map((e) => (
        <div key={e.seq} className={CONSOLE_ENTRY_COLORS[e.entryType] ?? 'text-gray-300'}>
          {e.content}
        </div>
      ))}
      {entries.length === 0 && (
        <div className="text-gray-500">Waiting for output...</div>
      )}
    </div>
  )
}

export function TasksPanel({ advancedMode = false }: { advancedMode?: boolean }): React.JSX.Element {
  const [actionError, setActionError] = useState<string | null>(null)
  const [consoleTaskId, setConsoleTaskId] = useState<number | null>(null)
  const [filters, setFilters] = useState<TaskFilters>(persistedFilters)
  const { data: tasks, refresh, error: tasksError, isLoading } = usePolling(() => window.api.tasks.list(), 10000)
  const { data: runningRuns } = usePolling(() => window.api.tasks.getRunningRuns(), 5000)
  const { data: workers } = usePolling(() => window.api.workers.list(), 30000)

  function updateFilters(next: TaskFilters): void {
    persistedFilters = next
    setFilters(next)
  }

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
    setActionError(null)
    try {
      if (task.status === 'paused') {
        await window.api.tasks.resume(task.id)
      } else {
        await window.api.tasks.pause(task.id)
      }
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update task status')
    }
  }

  async function deleteTask(id: number): Promise<void> {
    setActionError(null)
    try {
      await window.api.tasks.delete(id)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete task')
    }
  }

  async function runNow(id: number): Promise<void> {
    setActionError(null)
    try {
      await window.api.tasks.runNow(id)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to run task')
    }
  }

  if (isLoading && !tasks) {
    return <div className="p-4 text-xs text-gray-400">Loading...</div>
  }
  if (!tasks) {
    return <div className="p-4 text-xs text-red-500">{tasksError ?? 'Failed to load tasks.'}</div>
  }

  const taskCounts = {
    all: tasks.length,
    active: tasks.filter((t) => t.status === 'active').length,
    paused: tasks.filter((t) => t.status === 'paused').length,
    completed: tasks.filter((t) => t.status === 'completed').length
  }
  const filteredTasks = filterTasks(tasks, filters)
  const hasActiveFilters =
    filters.status !== 'all' || filters.trigger !== 'all' || filters.search.trim() !== ''

  return (
    <div className="flex flex-col h-full">
      <FilterBar
        filters={filters}
        onChange={updateFilters}
        advancedMode={advancedMode}
        taskCounts={taskCounts}
      />

      {tasksError && (
        <div className="px-3 py-2 text-xs text-yellow-700 bg-yellow-50">
          Temporary refresh issue: {tasksError}
        </div>
      )}
      {actionError && (
        <div className="px-3 py-2 text-xs text-red-500 bg-red-50">
          Action failed: {actionError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {filteredTasks.length === 0 ? (
        <div className="p-4 text-center text-xs text-gray-400">
          {hasActiveFilters ? (
            <>
              No tasks match filters.{' '}
              <button
                onClick={() => updateFilters({ status: 'all', trigger: 'all', search: '' })}
                className="text-blue-500 hover:text-blue-700"
              >
                Clear filters
              </button>
            </>
          ) : (
            'No tasks yet. Ask Claude in Claude Desktop or Claude Code to schedule one.'
          )}
        </div>
      ) : (
      filteredTasks.map((task) => {
        const activeRun = runningByTaskId.get(task.id)
        const source = sourceLabel(task)
        const worker = task.workerId != null ? workerMap.get(task.workerId) : undefined
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
              {source && (
                <span className="ml-1.5 text-gray-300">
                  via {source}
                </span>
              )}
              {worker && (
                <span className="ml-1.5 text-purple-400">
                  {worker.name}
                </span>
              )}
              {task.sessionContinuity && (
                <span className="ml-1.5 px-1 py-0.5 rounded bg-violet-100 text-violet-600">
                  continuous
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mb-1.5">
              Last run: {formatRelativeTime(task.lastRun)}
            </div>
            {activeRun && <ProgressBar run={activeRun} />}
            {activeRun && consoleTaskId === task.id && (
              <ConsoleView runId={activeRun.id} />
            )}
            <div className="flex gap-2">
              {activeRun && (
                <button
                  onClick={() => setConsoleTaskId(consoleTaskId === task.id ? null : task.id)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {consoleTaskId === task.id ? 'Hide Console' : 'Console'}
                </button>
              )}
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
      })
      )}
      </div>
    </div>
  )
}
