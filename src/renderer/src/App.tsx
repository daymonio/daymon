import { useEffect, useState } from 'react'

function App(): React.JSX.Element {
  const [entityCount, setEntityCount] = useState(0)
  const [taskCount, setTaskCount] = useState(0)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.memory.getStats().then((stats) => setEntityCount(stats.entityCount))
    window.api.tasks.list().then((tasks) => setTaskCount(tasks.length))
    window.api.app.getVersion().then(setVersion)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-white">
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h1 className="text-sm font-semibold text-gray-700">Daymon</h1>
        <span className="text-xs text-gray-400">v{version}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <h2 className="text-sm font-medium text-gray-600 mb-1">Status</h2>
            <p className="text-xs text-green-600">Running</p>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <h2 className="text-sm font-medium text-gray-600 mb-1">Memory</h2>
            <p className="text-xs text-gray-500">{entityCount} entities stored</p>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <h2 className="text-sm font-medium text-gray-600 mb-1">Tasks</h2>
            <p className="text-xs text-gray-500">
              {taskCount > 0 ? `${taskCount} active` : 'No active tasks'}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">daymon.io</p>
      </div>
    </div>
  )
}

export default App
