import { useState, useEffect, useRef, useCallback } from 'react'
import { useDocumentVisible } from '../hooks/useDocumentVisible'
import type { TaskRun, ConsoleLogEntry } from '@shared/types'

const CONSOLE_ENTRY_COLORS: Record<string, string> = {
  tool_call: 'text-yellow-400',
  assistant_text: 'text-green-300',
  tool_result: 'text-gray-400',
  result: 'text-blue-400',
  error: 'text-red-400'
}

const POLL_INTERVAL_MS = 2000
const MAX_ENTRIES_PER_RUN = 200

interface LiveConsoleSectionProps {
  runningRuns: TaskRun[]
  taskNames: Record<number, string>
}

export function LiveConsoleSection({
  runningRuns,
  taskNames
}: LiveConsoleSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const isVisible = useDocumentVisible()
  const [logsByRunId, setLogsByRunId] = useState<Map<number, ConsoleLogEntry[]>>(new Map())
  const lastSeqByRunId = useRef<Map<number, number>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const runningRunsRef = useRef(runningRuns)
  runningRunsRef.current = runningRuns

  // Clear state when collapsed
  useEffect(() => {
    if (!expanded) {
      setLogsByRunId(new Map())
      lastSeqByRunId.current = new Map()
    }
  }, [expanded])

  // Stable dependency: only changes when the set of run IDs changes
  const runIdsKey = runningRuns.map((r) => r.id).sort().join(',')

  // Poll console logs when expanded + visible + tasks running
  useEffect(() => {
    if (!expanded || !isVisible || runningRuns.length === 0) return

    let mounted = true

    async function poll(): Promise<void> {
      if (!mounted) return
      const runs = runningRunsRef.current
      const updates = new Map<number, ConsoleLogEntry[]>()

      await Promise.all(
        runs.map(async (run) => {
          try {
            const afterSeq = lastSeqByRunId.current.get(run.id) ?? 0
            const newEntries = await window.api.tasks.getConsoleLogs(run.id, afterSeq, 50)
            if (newEntries.length > 0) {
              lastSeqByRunId.current.set(run.id, newEntries[newEntries.length - 1].seq)
              updates.set(run.id, newEntries)
            }
          } catch {
            // non-fatal
          }
        })
      )

      if (!mounted || updates.size === 0) return

      setLogsByRunId((prev) => {
        const next = new Map(prev)
        for (const [runId, newEntries] of updates) {
          const existing = next.get(runId) ?? []
          const combined = [...existing, ...newEntries].slice(-MAX_ENTRIES_PER_RUN)
          next.set(runId, combined)
        }
        return next
      })
    }

    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [expanded, isVisible, runIdsKey])

  // Auto-scroll on new entries
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logsByRunId])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    autoScrollRef.current = atBottom
  }, [])

  return (
    <div className={`bg-gray-50 rounded-lg overflow-hidden ${expanded ? 'flex-1 flex flex-col min-h-0' : ''}`}>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-100 transition-colors shrink-0"
      >
        <span className="text-xs font-medium text-gray-600">
          Console
          {runningRuns.length > 0 && (
            <span className="text-blue-500 ml-1">({runningRuns.length} running)</span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-gray-900 mx-3 mb-3 rounded p-2 font-mono text-xs leading-relaxed min-h-[4rem]"
        >
          {runningRuns.length === 0 ? (
            <div className="text-gray-500">No tasks running</div>
          ) : (
            runningRuns.map((run) => {
              const entries = logsByRunId.get(run.id) ?? []
              const taskName = taskNames[run.taskId] ?? `Task #${run.taskId}`
              return (
                <div key={run.id} className="mb-2 last:mb-0">
                  {runningRuns.length > 1 && (
                    <div className="text-blue-400 font-semibold mb-0.5 sticky top-0 bg-gray-900 py-0.5">
                      {taskName}
                    </div>
                  )}
                  {entries.length === 0 ? (
                    <div className="text-gray-500">Waiting for output...</div>
                  ) : (
                    entries.map((e) => (
                      <div
                        key={`${run.id}-${e.seq}`}
                        className={CONSOLE_ENTRY_COLORS[e.entryType] ?? 'text-gray-300'}
                      >
                        {e.content}
                      </div>
                    ))
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
