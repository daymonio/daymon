import { useEffect, useState } from 'react'
import { useContainerWidth } from '../hooks/useContainerWidth'

interface PathsInfo {
  dbPath: string
  resultsDir: string
  dataDir: string
  claudeConfigPath: string
}

interface ClaudeCliStatus {
  available: boolean
  version?: string
  error?: string
}

interface ClaudeIntegrationStatus {
  claudeDesktop: { configured: boolean; configPath: string }
  claudeCode: { configured: boolean; configPath: string }
}

interface SettingsPanelProps {
  advancedMode: boolean
  onAdvancedModeChange: (enabled: boolean) => void
  onRefreshUpdateStatus?: () => void
}

interface UpdateStatus {
  status: string
  version?: string
  progress?: number
  error?: string
}

export function SettingsPanel({ advancedMode, onAdvancedModeChange, onRefreshUpdateStatus }: SettingsPanelProps): React.JSX.Element {
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  const wide = containerWidth >= 600
  const [version, setVersion] = useState('')
  const [paths, setPaths] = useState<PathsInfo | null>(null)
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null)
  const [integrationStatus, setIntegrationStatus] = useState<ClaudeIntegrationStatus | null>(null)
  const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null)
  const [notifications, setNotifications] = useState<boolean | null>(null)
  const [largeWindow, setLargeWindow] = useState<boolean | null>(null)
  const [quietHours, setQuietHours] = useState<boolean | null>(null)
  const [quietFrom, setQuietFrom] = useState('08:00')
  const [quietUntil, setQuietUntil] = useState('22:00')
  const [defaultNudgeMode, setDefaultNudgeMode] = useState<string>('always')
  const [telemetry, setTelemetry] = useState<boolean | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    if (!window.api) return
    window.api.app.getVersion().then(setVersion)
    window.api.app.getPaths().then(setPaths)
    window.api.app.checkClaude().then(setCliStatus)
    window.api.app.getClaudeIntegration().then(setIntegrationStatus)
    window.api.app.getAutoLaunch().then(setAutoLaunch)
    window.api.settings.get('notifications_enabled').then((v) => {
      setNotifications(v !== 'false')
    })
    window.api.settings.get('large_window_enabled').then((v) => {
      setLargeWindow(v === 'true')
    })
    window.api.settings.get('auto_nudge_quiet_hours').then((v) => {
      setQuietHours(v === 'true')
    })
    window.api.settings.get('auto_nudge_quiet_from').then((v) => {
      if (v) setQuietFrom(v)
    })
    window.api.settings.get('auto_nudge_quiet_until').then((v) => {
      if (v) setQuietUntil(v)
    })
    window.api.settings.get('default_nudge_mode').then((v) => {
      if (v) setDefaultNudgeMode(v)
    })
    window.api.settings.get('telemetry_enabled').then((v) => {
      setTelemetry(v !== 'false')
    })
    window.api.app.getUpdateStatus().then(setUpdateStatus)
  }, [])

  async function toggleAutoLaunch(): Promise<void> {
    const next = !autoLaunch
    await window.api.app.setAutoLaunch(next)
    setAutoLaunch(next)
  }

  async function toggleNotifications(): Promise<void> {
    const next = !notifications
    await window.api.settings.set('notifications_enabled', String(next))
    setNotifications(next)
  }

  async function toggleLargeWindow(): Promise<void> {
    const next = !largeWindow
    await window.api.settings.set('large_window_enabled', String(next))
    await window.api.app.setWindowSize(next)
    setLargeWindow(next)
  }

  async function toggleAdvancedMode(): Promise<void> {
    const next = !advancedMode
    await window.api.settings.set('advanced_mode', String(next))
    onAdvancedModeChange(next)
  }

  async function toggleTelemetry(): Promise<void> {
    const next = !telemetry
    await window.api.settings.set('telemetry_enabled', String(next))
    setTelemetry(next)
  }

  async function toggleQuietHours(): Promise<void> {
    const next = !quietHours
    await window.api.settings.set('auto_nudge_quiet_hours', String(next))
    setQuietHours(next)
  }

  async function updateQuietFrom(value: string): Promise<void> {
    setQuietFrom(value)
    await window.api.settings.set('auto_nudge_quiet_from', value)
  }

  async function updateQuietUntil(value: string): Promise<void> {
    setQuietUntil(value)
    await window.api.settings.set('auto_nudge_quiet_until', value)
  }

  async function updateDefaultNudgeMode(value: string): Promise<void> {
    setDefaultNudgeMode(value)
    await window.api.settings.set('default_nudge_mode', value)
  }

  async function handleUninstall(): Promise<void> {
    if (!confirmUninstall) {
      setConfirmUninstall(true)
      return
    }
    await window.api.app.uninstall()
  }

  function row(label: string, value: string | null): React.JSX.Element {
    return (
      <div className="flex flex-col py-1.5">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs text-gray-400 truncate selectable">{value ?? '\u2014'}</span>
      </div>
    )
  }

  function toggle(
    label: string,
    value: boolean | null,
    onChange: () => void,
    description?: string
  ): React.JSX.Element {
    const loading = value === null
    return (
      <div className="py-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">{label}</span>
          <button
            onClick={onChange}
            disabled={loading}
            className={`w-8 h-4 rounded-full transition-colors relative ${
              loading ? 'bg-gray-200' : value ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            {!loading && (
              <span
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                  value ? 'left-4' : 'left-0.5'
                }`}
              />
            )}
          </button>
        </div>
        {description && (
          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{description}</p>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`p-4 ${wide ? 'grid grid-cols-2 gap-4' : 'space-y-4'}`}>
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Preferences</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1">
          {toggle('Launch at login', autoLaunch, toggleAutoLaunch, 'Start Daymon when you log in')}
          {toggle('Notifications', notifications, toggleNotifications, 'Show notifications when tasks complete')}
          {toggle('Large window', largeWindow, toggleLargeWindow, 'Bigger window with expanded cards and table layout')}
          {toggle('Advanced mode', advancedMode, toggleAdvancedMode, 'Show task IDs, debug info, and extra controls')}
          {toggle('Help improve Daymon', telemetry, toggleTelemetry, 'Share anonymous crash reports and diagnostics. No personal information is collected.')}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Auto-Nudge</h3>
        <p className="text-[10px] text-gray-400 mb-1.5 leading-tight">When a task finishes, Daymon can show results in your active Claude Code chat automatically.</p>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1">
          {window.api.app.getPlatform() === 'darwin' ? (
          <div className="py-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Accessibility permission</span>
              <button
                onClick={() => window.api.app.requestAccessibility()}
                className="text-blue-500 hover:text-blue-700 text-xs cursor-pointer"
              >
                Open Settings
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">Required for auto-nudge to type into Claude Code</p>
          </div>
          ) : window.api.app.getPlatform() === 'linux' ? (
          <div className="py-1">
            <div className="text-xs text-gray-600">Auto-nudge requirement</div>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
              Requires <code className="text-gray-500">xdotool</code> package (X11 only). Install with: <code className="text-gray-500">sudo apt install xdotool</code>
            </p>
          </div>
          ) : window.api.app.getPlatform() === 'win32' ? (
          <div className="py-1">
            <div className="text-xs text-gray-600">Auto-nudge</div>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
              Uses PowerShell to send keystrokes. No additional setup needed.
            </p>
          </div>
          ) : null}
          <div className="py-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Default for new tasks</span>
              <div className="flex items-center gap-0.5">
                {([['always', 'All'], ['failure_only', 'Fail'], ['never', 'Off']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => updateDefaultNudgeMode(value)}
                    className={`px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors ${
                      defaultNudgeMode === value
                        ? value === 'always' ? 'bg-green-100 text-green-700' : value === 'failure_only' ? 'bg-orange-100 text-orange-700' : 'bg-gray-700 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 leading-tight">
              <span className="font-medium text-green-600">All</span> — notify on every completion &nbsp;
              <span className="font-medium text-orange-600">Fail</span> — only when task fails &nbsp;
              <span className="font-medium text-gray-600">Off</span> — never notify
            </p>
          </div>
          {toggle(
            'Quiet hours',
            quietHours,
            toggleQuietHours,
            'Suppress nudges during set hours'
          )}
          {quietHours && (
            <div className="flex items-center gap-2 text-xs py-1 pl-2 border-l-2 border-gray-200 ml-1">
              <span className="text-gray-500">From</span>
              <input
                type="time"
                value={quietFrom}
                onChange={(e) => updateQuietFrom(e.target.value)}
                className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-600"
              />
              <span className="text-gray-500">until</span>
              <input
                type="time"
                value={quietUntil}
                onChange={(e) => updateQuietUntil(e.target.value)}
                className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-600"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Connection</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Claude CLI</span>
            <span className={cliStatus?.available ? 'text-green-600' : 'text-red-500'}>
              {cliStatus === null
                ? '...'
                : cliStatus.available
                  ? cliStatus.version || 'Found'
                  : 'Not found'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Claude Desktop</span>
            <span className={integrationStatus?.claudeDesktop.configured ? 'text-green-600' : 'text-gray-400'}>
              {integrationStatus == null ? '...' : integrationStatus.claudeDesktop.configured ? 'Connected' : 'Not found'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Claude Code</span>
            <span className={integrationStatus?.claudeCode.configured ? 'text-green-600' : 'text-gray-400'}>
              {integrationStatus == null ? '...' : integrationStatus.claudeCode.configured ? 'Connected' : 'Not found'}
            </span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">App</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Version</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">{version || '...'}</span>
              {import.meta.env.DEV && advancedMode && (
                <button
                  onClick={async () => {
                    await window.api.app.simulateUpdate()
                    setTimeout(() => {
                      window.api.app.getUpdateStatus().then(setUpdateStatus)
                      onRefreshUpdateStatus?.()
                    }, 500)
                  }}
                  className="text-orange-500 hover:text-orange-700 text-xs"
                >
                  Simulate
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">
              {updateStatus?.status === 'available' && `v${updateStatus.version} available`}
              {updateStatus?.status === 'downloading' && `Downloading${updateStatus.progress != null ? ` ${updateStatus.progress}%` : '...'}`}
              {updateStatus?.status === 'ready' && 'Update ready'}
              {updateStatus?.status === 'checking' && 'Checking...'}
              {updateStatus?.status === 'not-available' && 'Up to date'}
              {updateStatus?.status === 'error' && (
                <span className="text-red-500" title={updateStatus.error}>Update check failed</span>
              )}
              {(!updateStatus || updateStatus.status === 'idle') && 'Updates'}
            </span>
            {(!updateStatus || updateStatus.status === 'idle' || updateStatus.status === 'not-available' || updateStatus.status === 'error') && (
              <button
                onClick={async () => {
                  await window.api.app.checkForUpdates()
                  setTimeout(() => window.api.app.getUpdateStatus().then(setUpdateStatus), 1000)
                }}
                className="text-blue-500 hover:text-blue-700"
              >
                Check
              </button>
            )}
            {updateStatus?.status === 'available' && (
              <button
                onClick={async () => {
                  await window.api.app.downloadUpdate()
                  const poll = setInterval(async () => {
                    const s = await window.api.app.getUpdateStatus()
                    setUpdateStatus(s)
                    if (s.status !== 'downloading') clearInterval(poll)
                  }, 500)
                }}
                className="text-blue-500 hover:text-blue-700"
              >
                Download
              </button>
            )}
            {updateStatus?.status === 'ready' && (
              <button
                onClick={() => window.api.app.installUpdate()}
                className="text-green-600 hover:text-green-700 font-medium"
              >
                Install & Restart
              </button>
            )}
          </div>
        </div>
      </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Paths</h3>
        <div className="bg-gray-50 rounded-lg p-2 divide-y divide-gray-100">
          {row('Database', paths?.dbPath ?? null)}
          {row('Results Directory', paths?.resultsDir ?? null)}
          {row('Data Directory', paths?.dataDir ?? null)}
          {row('Claude Config', paths?.claudeConfigPath ?? null)}
        </div>
      </div>

      <div className={`${wide ? 'col-span-2 grid grid-cols-2 gap-2' : 'space-y-2'}`}>
        <button
          onClick={() => window.open('https://github.com/daymonio/daymon/issues/new')}
          className="w-full py-1.5 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded transition-colors"
        >
          Report Bug
        </button>
        <button
          onClick={() => window.open('mailto:hello@daymon.io')}
          className="w-full py-1.5 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded transition-colors"
        >
          Email Developer
        </button>
        <button
          onClick={() => window.open('https://github.com/daymonio/daymon')}
          className="w-full py-1.5 text-xs text-yellow-600 hover:text-yellow-700 border border-yellow-200 hover:border-yellow-300 rounded transition-colors"
        >
          Star Us on GitHub
        </button>
        <button
          onClick={() => window.open('mailto:hello@daymon.io?subject=Subscribe&body=Subscribe me for updates')}
          className="w-full py-1.5 text-xs text-green-600 hover:text-green-700 border border-green-200 hover:border-green-300 rounded transition-colors"
        >
          Subscribe for Updates
        </button>
        <button
          onClick={() => window.api.app.quit()}
          className="w-full py-1.5 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded transition-colors"
        >
          Quit Daymon
        </button>
        <button
          onClick={handleUninstall}
          className="w-full py-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded transition-colors"
        >
          {confirmUninstall ? 'Confirm: Remove config & data, then quit' : 'Uninstall Daymon'}
        </button>
      </div>
    </div>
  )
}
