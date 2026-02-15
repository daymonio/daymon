import { useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { StatusPanel } from './components/StatusPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { WorkersPanel } from './components/WorkersPanel'
import { TasksPanel } from './components/TasksPanel'
import { WatchesPanel } from './components/WatchesPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { SettingsPanel } from './components/SettingsPanel'

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('status')

  function renderPanel(): React.JSX.Element {
    switch (tab) {
      case 'status':
        return <StatusPanel onNavigate={(t) => setTab(t as Tab)} />
      case 'memory':
        return <MemoryPanel />
      case 'workers':
        return <WorkersPanel />
      case 'tasks':
        return <TasksPanel />
      case 'watches':
        return <WatchesPanel />
      case 'results':
        return <ResultsPanel />
      case 'settings':
        return <SettingsPanel />
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h1 className="text-sm font-semibold text-gray-700">Daymon</h1>
      </div>

      <TabBar active={tab} onChange={setTab} />

      <div className="flex-1 overflow-y-auto">
        {renderPanel()}
      </div>
    </div>
  )
}

export default App
