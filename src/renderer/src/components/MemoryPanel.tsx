import { useState, useCallback } from 'react'
import { usePolling } from '../hooks/usePolling'
import type { Entity, Observation } from '@shared/types'

export function MemoryPanel(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [observations, setObservations] = useState<Observation[]>([])

  const fetcher = useCallback(
    () =>
      search.trim()
        ? window.api.memory.searchEntities(search.trim())
        : window.api.memory.listEntities(),
    [search]
  )

  const { data: entities, refresh } = usePolling(fetcher, 5000)

  async function toggleExpand(id: number): Promise<void> {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    const obs = await window.api.memory.getObservations(id)
    setObservations(obs)
  }

  async function deleteEntity(id: number): Promise<void> {
    await window.api.memory.deleteEntity(id)
    if (expandedId === id) setExpandedId(null)
    refresh()
  }

  async function deleteObservation(id: number, entityId: number): Promise<void> {
    await window.api.memory.deleteObservation(id)
    const obs = await window.api.memory.getObservations(entityId)
    setObservations(obs)
  }

  function buildMemoryPrompt(entity: Entity, obs: Observation[]): string {
    const parts = [`Here is a Daymon memory entity "${entity.name}" (${entity.type}${entity.category ? `, ${entity.category}` : ''}):`]
    if (obs.length > 0) {
      parts.push('')
      for (const o of obs) parts.push(`- ${o.content}`)
    }
    parts.push('', 'Present this information in a well-formatted way.')
    return parts.join('\n')
  }

  async function openInApp(entity: Entity, target: 'claude-code' | 'claude-desktop'): Promise<void> {
    // Ensure we have observations loaded
    let obs = observations
    if (expandedId !== entity.id) {
      obs = await window.api.memory.getObservations(entity.id)
    }
    const message = buildMemoryPrompt(entity, obs)
    await window.api.app.sendToApp(target, message)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200">
        <input
          type="text"
          placeholder="Search entities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {!entities || entities.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">
            {search ? 'No matching entities' : 'No memories yet'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entities.map((entity: Entity) => (
              <div key={entity.id}>
                <div
                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleExpand(entity.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-800 truncate">
                      {entity.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {entity.type}
                      {entity.category && <span> &middot; {entity.category}</span>}
                    </div>
                  </div>
                  <div className="ml-2 flex gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openInApp(entity, 'claude-code')
                      }}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      Claude Code
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openInApp(entity, 'claude-desktop')
                      }}
                      className="text-xs text-purple-500 hover:text-purple-700"
                    >
                      Desktop
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteEntity(entity.id)
                      }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expandedId === entity.id && (
                  <div className="px-3 pb-2 bg-gray-50">
                    {observations.length === 0 ? (
                      <div className="text-xs text-gray-400 py-1">No observations</div>
                    ) : (
                      <div className="space-y-1">
                        {observations.map((obs) => (
                          <div
                            key={obs.id}
                            className="flex items-start justify-between text-xs p-1.5 bg-white rounded"
                          >
                            <span className="text-gray-600 selectable flex-1 mr-2">
                              {obs.content}
                            </span>
                            <button
                              onClick={() => deleteObservation(obs.id, entity.id)}
                              className="text-red-400 hover:text-red-600 shrink-0"
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
