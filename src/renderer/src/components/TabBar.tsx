export type Tab = 'status' | 'memory' | 'workers' | 'tasks' | 'results' | 'settings'

const tabs: { id: Tab; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'memory', label: 'Memory' },
  { id: 'workers', label: 'Workers' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'results', label: 'Results' },
  { id: 'settings', label: 'Settings' }
]

interface TabBarProps {
  active: Tab
  onChange: (tab: Tab) => void
}

export function TabBar({ active, onChange }: TabBarProps): React.JSX.Element {
  return (
    <div className="flex border-b border-gray-200 bg-gray-50 px-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
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
