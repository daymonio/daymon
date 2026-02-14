import { useState, useEffect } from 'react'
import { usePolling } from '../hooks/usePolling'
import type { TaskRun, Task } from '@shared/types'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function ResultsPanel(): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [taskNames, setTaskNames] = useState<Record<number, string>>({})
  const { data: runs } = usePolling(() => window.api.tasks.listAllRuns(30), 5000)

  useEffect(() => {
    window.api.tasks.list().then((tasks: Task[]) => {
      const map: Record<number, string> = {}
      for (const t of tasks) map[t.id] = t.name
      setTaskNames(map)
    })
  }, [])

  if (!runs) {
    return <div className="p-4 text-xs text-gray-400">Loading...</div>
  }

  if (runs.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-gray-400">No task runs yet.</div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {runs.map((run: TaskRun) => (
        <div key={run.id}>
          <div
            className="px-3 py-2 hover:bg-gray-50 cursor-pointer"
            onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-gray-800 truncate">
                {taskNames[run.taskId] ?? `Task #${run.taskId}`}
              </span>
              <span
                className={`text-xs ${run.status === 'completed' ? 'text-green-600' : run.status === 'running' ? 'text-blue-500' : 'text-red-500'}`}
              >
                {run.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{formatTime(run.startedAt)}</span>
              {run.durationMs != null && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
            </div>
          </div>

          {expandedId === run.id && (
            <div className="px-3 pb-2 bg-gray-50">
              {run.errorMessage && (
                <div className="text-xs text-red-500 mb-1 p-1.5 bg-red-50 rounded selectable">
                  {run.errorMessage}
                </div>
              )}
              {run.result && (
                <div className="text-xs text-gray-600 p-1.5 bg-white rounded max-h-40 overflow-y-auto selectable whitespace-pre-wrap">
                  {run.result}
                </div>
              )}
              {!run.result && !run.errorMessage && (
                <div className="text-xs text-gray-400 py-1">No output</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
