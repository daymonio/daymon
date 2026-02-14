import { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import type { Worker } from '@shared/types'

export function WorkersPanel(): React.JSX.Element {
  const { data: workers, refresh } = usePolling(() => window.api.workers.list(), 5000)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createPrompt, setCreatePrompt] = useState('')

  // Edit state
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPrompt, setEditPrompt] = useState('')

  async function handleCreate(): Promise<void> {
    if (!createName.trim() || !createPrompt.trim()) return
    await window.api.workers.create({
      name: createName.trim(),
      systemPrompt: createPrompt.trim(),
      description: createDesc.trim() || undefined
    })
    setCreateName('')
    setCreateDesc('')
    setCreatePrompt('')
    setShowCreate(false)
    refresh()
  }

  function toggleExpand(worker: Worker): void {
    if (expandedId === worker.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(worker.id)
    setEditName(worker.name)
    setEditDesc(worker.description ?? '')
    setEditPrompt(worker.systemPrompt)
  }

  async function handleSave(id: number): Promise<void> {
    await window.api.workers.update(id, {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      systemPrompt: editPrompt.trim()
    })
    refresh()
  }

  async function handleSetDefault(id: number): Promise<void> {
    await window.api.workers.update(id, { isDefault: true })
    refresh()
  }

  async function handleDelete(id: number): Promise<void> {
    await window.api.workers.delete(id)
    if (expandedId === id) setExpandedId(null)
    refresh()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {workers ? `${workers.length} worker(s)` : 'Loading...'}
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs text-blue-500 hover:text-blue-700 font-medium"
        >
          {showCreate ? 'Cancel' : '+ New Worker'}
        </button>
      </div>

      {showCreate && (
        <div className="p-3 border-b border-gray-200 bg-gray-50 space-y-2">
          <input
            type="text"
            placeholder="Worker name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
          />
          <textarea
            placeholder="System prompt — defines personality, capabilities, constraints..."
            value={createPrompt}
            onChange={(e) => setCreatePrompt(e.target.value)}
            rows={6}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white font-mono resize-y"
          />
          <button
            onClick={handleCreate}
            disabled={!createName.trim() || !createPrompt.trim()}
            className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!workers || workers.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">
            No workers yet. Create one above or via MCP.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {workers.map((worker: Worker) => (
              <div key={worker.id}>
                <div
                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleExpand(worker)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800 truncate">
                        {worker.name}
                      </span>
                      {worker.isDefault && (
                        <span className="px-1 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                          default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {worker.taskCount} task(s)
                      {worker.description && <span> &middot; {worker.description}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-300 ml-2">
                    {expandedId === worker.id ? '▼' : '▶'}
                  </span>
                </div>

                {expandedId === worker.id && (
                  <div className="px-3 pb-3 bg-gray-50 space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
                      placeholder="Name"
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
                      placeholder="Description"
                    />
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={6}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white font-mono resize-y"
                      placeholder="System prompt"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(worker.id)}
                        className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                      >
                        Save
                      </button>
                      {!worker.isDefault && (
                        <button
                          onClick={() => handleSetDefault(worker.id)}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(worker.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
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
