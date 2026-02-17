import { useEffect, useRef, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { StatusPanel } from './components/StatusPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { WorkersPanel } from './components/WorkersPanel'
import { TasksPanel } from './components/TasksPanel'
import { WatchesPanel } from './components/WatchesPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { HelpPanel } from './components/HelpPanel'
import { CongratsModal } from './components/CongratsModal'
import { UpdateModal } from './components/UpdateModal'

const ADVANCED_TABS = new Set<Tab>(['memory', 'watches', 'results'])

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('status')
  const [advancedMode, setAdvancedMode] = useState(false)
  const [showCongrats, setShowCongrats] = useState(false)
  const celebratedRef = useRef(false)
  const [updateStatus, setUpdateStatus] = useState<{ status: string; version?: string; progress?: number } | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  function refreshUpdateStatus(): void {
    window.api.app.getUpdateStatus().then(setUpdateStatus)
  }

  // Poll update status
  useEffect(() => {
    if (!window.api?.app) return
    refreshUpdateStatus()
    const poll = setInterval(refreshUpdateStatus, 5000)
    return () => clearInterval(poll)
  }, [])

  const updateActive = updateStatus != null && (updateStatus.status === 'available' || updateStatus.status === 'downloading' || updateStatus.status === 'ready')
  const showUpdateModal = updateActive && !updateDismissed

  // Reset dismissed flag when update status goes back to idle (e.g. after install)
  useEffect(() => {
    if (!updateActive) setUpdateDismissed(false)
  }, [updateActive])

  async function handleUpdateDownload(): Promise<void> {
    await window.api.app.downloadUpdate()
    const poll = setInterval(async () => {
      const s = await window.api.app.getUpdateStatus()
      setUpdateStatus(s)
      if (s.status !== 'downloading') clearInterval(poll)
    }, 500)
  }

  useEffect(() => {
    if (!window.api?.settings) return
    window.api.settings.get('advanced_mode').then((v) => {
      setAdvancedMode(v === 'true')
    }).catch(() => {
      // Keep default when bridge/settings are not yet available.
    })
  }, [])

  useEffect(() => {
    if (!window.api?.settings || !window.api?.tasks) return

    async function checkFirstCompletion(): Promise<void> {
      if (celebratedRef.current) return
      try {
        const celebrated = await window.api.settings.get('first_task_celebrated')
        if (celebrated === 'true') {
          celebratedRef.current = true
          return
        }
        const runs = await window.api.tasks.listAllRuns(1)
        if (runs.length > 0 && runs[0].status === 'completed') {
          setShowCongrats(true)
        }
      } catch {
        // Non-critical — silently ignore
      }
    }

    checkFirstCompletion()
    const interval = setInterval(checkFirstCompletion, 10000)
    return () => clearInterval(interval)
  }, [])

  async function handleCongratsDismiss(): Promise<void> {
    celebratedRef.current = true
    setShowCongrats(false)
    try {
      await window.api.settings.set('first_task_celebrated', 'true')
    } catch {
      // Best-effort persist
    }
  }

  function handleAdvancedModeChange(enabled: boolean): void {
    setAdvancedMode(enabled)
    if (!enabled && ADVANCED_TABS.has(tab)) {
      setTab('status')
    }
  }

  function renderPanel(): React.JSX.Element {
    switch (tab) {
      case 'status':
        return <StatusPanel onNavigate={(t) => setTab(t as Tab)} advancedMode={advancedMode} updateStatus={updateStatus} onShowUpdateModal={() => setUpdateDismissed(false)} />
      case 'memory':
        return <MemoryPanel />
      case 'workers':
        return <WorkersPanel />
      case 'tasks':
        return <TasksPanel advancedMode={advancedMode} />
      case 'watches':
        return <WatchesPanel />
      case 'results':
        return <ResultsPanel />
      case 'settings':
        return <SettingsPanel advancedMode={advancedMode} onAdvancedModeChange={handleAdvancedModeChange} onRefreshUpdateStatus={refreshUpdateStatus} />
      case 'help':
        return <HelpPanel />
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h1 className="text-sm font-semibold text-gray-700">Daymon</h1>
        <button
          onClick={() => window.api.app.hideWindow()}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      <TabBar active={tab} onChange={setTab} advancedMode={advancedMode} />

      <div className="flex-1 overflow-y-auto">
        {renderPanel()}
      </div>
      {showCongrats && <CongratsModal onDismiss={handleCongratsDismiss} />}
      {showUpdateModal && updateStatus && (
        <UpdateModal
          status={updateStatus.status}
          version={updateStatus.version}
          progress={updateStatus.progress}
          onDownload={handleUpdateDownload}
          onInstall={() => window.api.app.installUpdate()}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
    </div>
  )
}

export default App
