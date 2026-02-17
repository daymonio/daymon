export type Tab = 'status' | 'memory' | 'workers' | 'tasks' | 'watches' | 'results' | 'settings' | 'help'

const allTabs: { id: Tab; label: string; advanced?: boolean }[] = [
  { id: 'status', label: 'Status' },
  { id: 'memory', label: 'Memory', advanced: true },
  { id: 'workers', label: 'Workers' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'watches', label: 'Watches', advanced: true },
  { id: 'results', label: 'Results' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' }
]

interface TabBarProps {
  active: Tab
  onChange: (tab: Tab) => void
  advancedMode: boolean
}

export function TabBar({ active, onChange, advancedMode }: TabBarProps): React.JSX.Element {
  const tabs = advancedMode ? allTabs : allTabs.filter((t) => !t.advanced)

  return (
    <div className="flex border-b border-gray-200 bg-gray-50 px-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            active === tab.id
              ? 'text-gray-900 border-b-2 border-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
