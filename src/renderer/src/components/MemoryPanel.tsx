import { useState, useCallback, useEffect, useRef } from 'react'
import { usePolling } from '../hooks/usePolling'
import { useContainerWidth } from '../hooks/useContainerWidth'
import type { Entity, Observation } from '@shared/types'

export function MemoryPanel(): React.JSX.Element {
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  const wide = containerWidth >= 600
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [obsCache, setObsCache] = useState<Record<number, Observation[]>>({})
  const obsCacheRef = useRef(obsCache)
  obsCacheRef.current = obsCache

  const fetcher = useCallback(
    () =>
      search.trim()
        ? window.api.memory.searchEntities(search.trim())
        : window.api.memory.listEntities(),
    [search]
  )

  const { data: entities, refresh } = usePolling(fetcher, 5000)

  // In wide mode, eagerly load observations for all entities
  useEffect(() => {
    if (!wide || !entities || entities.length === 0) return
    let cancelled = false
    const load = async (): Promise<void> => {
      const newCache: Record<number, Observation[]> = {}
      for (const entity of entities) {
        if (cancelled) return
        // Reuse cached if we already have it
        if (obsCacheRef.current[entity.id]) {
          newCache[entity.id] = obsCacheRef.current[entity.id]
        } else {
          try {
            newCache[entity.id] = await window.api.memory.getObservations(entity.id)
          } catch {
            newCache[entity.id] = []
          }
        }
      }
      if (!cancelled) setObsCache(newCache)
    }
    load()
    return () => { cancelled = true }
  }, [wide, entities])

  async function toggleExpand(id: number): Promise<void> {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!obsCache[id]) {
      const obs = await window.api.memory.getObservations(id)
      setObsCache((prev) => ({ ...prev, [id]: obs }))
    }
  }

  async function deleteEntity(id: number): Promise<void> {
    await window.api.memory.deleteEntity(id)
    if (expandedId === id) setExpandedId(null)
    setObsCache((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    refresh()
  }

  async function deleteObservation(obsId: number, entityId: number): Promise<void> {
    await window.api.memory.deleteObservation(obsId)
    const obs = await window.api.memory.getObservations(entityId)
    setObsCache((prev) => ({ ...prev, [entityId]: obs }))
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
    let obs = obsCache[entity.id]
    if (!obs) {
      obs = await window.api.memory.getObservations(entity.id)
      setObsCache((prev) => ({ ...prev, [entity.id]: obs }))
    }
    const message = buildMemoryPrompt(entity, obs)
    await window.api.app.sendToApp(target, message)
  }

  function renderObservations(entityId: number): React.JSX.Element | null {
    const obs = obsCache[entityId]
    if (!obs) return <div className="text-xs text-gray-400 py-1">Loading...</div>
    if (obs.length === 0) return <div className="text-xs text-gray-400 py-1">No observations</div>
    return (
      <div className="space-y-1">
        {obs.map((o) => (
          <div key={o.id} className="flex items-start justify-between text-xs p-1.5 bg-white rounded">
            <span className="text-gray-600 selectable flex-1 mr-2">{o.content}</span>
            <button onClick={() => deleteObservation(o.id, entityId)} className="text-red-400 hover:text-red-600 shrink-0">x</button>
          </div>
        ))}
      </div>
    )
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

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {!entities || entities.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">
            {search ? 'No matching entities' : 'No memories yet'}
          </div>
        ) : wide ? (
          <div className="grid grid-cols-2 gap-3 p-3">
            {entities.map((entity: Entity, i: number) => (
              <div key={entity.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === entity.id ? null : entity.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-800 truncate">{entity.name}</div>
                    <div className="text-xs text-gray-400">
                      {entity.type}
                      {entity.category && <span> &middot; {entity.category}</span>}
                    </div>
                  </div>
                  <div className="ml-2 flex gap-2 shrink-0">
                    <button onClick={() => openInApp(entity, 'claude-code')} className="text-xs text-blue-500 hover:text-blue-700">Code</button>
                    <button onClick={() => openInApp(entity, 'claude-desktop')} className="text-xs text-purple-500 hover:text-purple-700">Desktop</button>
                    <button onClick={() => deleteEntity(entity.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                  </div>
                </div>
                {(i < 2 || expandedId === entity.id) && (
                  <div className="px-3 pb-2 bg-gray-50">
                    {renderObservations(entity.id)}
                  </div>
                )}
              </div>
            ))}
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
                    <div className="text-xs font-medium text-gray-800 truncate">{entity.name}</div>
                    <div className="text-xs text-gray-400">
                      {entity.type}
                      {entity.category && <span> &middot; {entity.category}</span>}
                    </div>
                  </div>
                  <div className="ml-2 flex gap-2 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); openInApp(entity, 'claude-code') }} className="text-xs text-blue-500 hover:text-blue-700">Claude Code</button>
                    <button onClick={(e) => { e.stopPropagation(); openInApp(entity, 'claude-desktop') }} className="text-xs text-purple-500 hover:text-purple-700">Desktop</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteEntity(entity.id) }} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                  </div>
                </div>
                {expandedId === entity.id && (
                  <div className="px-3 pb-2 bg-gray-50">
                    {renderObservations(entity.id)}
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
