import { useState, useEffect } from 'react'
import { usePolling } from '../hooks/usePolling'
import type { TaskRun, Task, ConsoleLogEntry } from '@shared/types'
import { formatDateTimeShort } from '../utils/time'

const CONSOLE_ENTRY_COLORS: Record<string, string> = {
  tool_call: 'text-yellow-400',
  assistant_text: 'text-green-300',
  tool_result: 'text-gray-400',
  result: 'text-blue-400',
  error: 'text-red-400'
}

function ConsoleLogHistory({ runId }: { runId: number }): React.JSX.Element {
  const [entries, setEntries] = useState<ConsoleLogEntry[] | null>(null)
  const [showConsole, setShowConsole] = useState(false)

  useEffect(() => {
    if (!showConsole) return
    window.api.tasks.getConsoleLogs(runId, 0, 200).then(setEntries).catch(() => setEntries([]))
  }, [runId, showConsole])

  if (!showConsole) {
    return (
      <button
        onClick={() => setShowConsole(true)}
        className="text-xs text-gray-400 hover:text-gray-600 mt-1"
      >
        Show console log
      </button>
    )
  }

  if (!entries) {
    return <div className="text-xs text-gray-400 mt-1">Loading...</div>
  }

  if (entries.length === 0) {
    return <div className="text-xs text-gray-400 mt-1">No console logs for this run.</div>
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setShowConsole(false)}
        className="text-xs text-gray-400 hover:text-gray-600 mb-1"
      >
        Hide console log
      </button>
      <div className="max-h-48 overflow-y-auto bg-gray-900 rounded p-2 font-mono text-xs leading-relaxed">
        {entries.map((e) => (
          <div key={e.seq} className={CONSOLE_ENTRY_COLORS[e.entryType] ?? 'text-gray-300'}>
            {e.content}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ResultsPanel(): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [taskNames, setTaskNames] = useState<Record<number, string>>({})
  const { data: runs, error, isLoading } = usePolling(() => window.api.tasks.listAllRuns(30), 5000)

  useEffect(() => {
    window.api.tasks.list().then((tasks: Task[]) => {
      const map: Record<number, string> = {}
      for (const t of tasks) map[t.id] = t.name
      setTaskNames(map)
    })
  }, [])

  if (isLoading && !runs) {
    return <div className="p-4 text-xs text-gray-400">Loading...</div>
  }
  if (!runs) {
    return <div className="p-4 text-xs text-red-500">{error ?? 'Failed to load runs.'}</div>
  }

  if (runs.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-gray-400">No task runs yet.</div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {error && (
        <div className="px-3 py-2 text-xs text-yellow-700 bg-yellow-50">
          Temporary refresh issue: {error}
        </div>
      )}
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
              <span>{formatDateTimeShort(run.startedAt)}</span>
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
              <ConsoleLogHistory runId={run.id} />
              {run.resultFile && (
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() =>
                      window.api.app.sendToApp(
                        'claude-code',
                        `Read the file at ${run.resultFile} and present the results in a well-formatted way.`
                      )
                    }
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    Open in Claude Code
                  </button>
                  <button
                    onClick={() =>
                      window.api.app.sendToApp(
                        'claude-desktop',
                        '',
                        run.resultFile!
                      )
                    }
                    className="text-xs text-purple-500 hover:text-purple-700"
                  >
                    Open in Claude Desktop
                  </button>
                  <button
                    onClick={() => window.api.app.showInFolder(run.resultFile!)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Show in Finder
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
