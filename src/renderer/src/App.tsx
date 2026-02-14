import { useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { StatusPanel } from './components/StatusPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { TasksPanel } from './components/TasksPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { SettingsPanel } from './components/SettingsPanel'

const panels: Record<Tab, () => React.JSX.Element> = {
  status: StatusPanel,
  memory: MemoryPanel,
  tasks: TasksPanel,
  results: ResultsPanel,
  settings: SettingsPanel
}

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('status')
  const Panel = panels[tab]

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
        <Panel />
      </div>
    </div>
  )
}

export default App
