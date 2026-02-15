import { useEffect, useState } from 'react'

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
}

interface UpdateStatus {
  status: string
  version?: string
  progress?: number
  error?: string
}

export function SettingsPanel({ advancedMode, onAdvancedModeChange }: SettingsPanelProps): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [paths, setPaths] = useState<PathsInfo | null>(null)
  const [cliStatus, setCliStatus] = useState<ClaudeCliStatus | null>(null)
  const [integrationStatus, setIntegrationStatus] = useState<ClaudeIntegrationStatus | null>(null)
  const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null)
  const [notifications, setNotifications] = useState<boolean>(true)
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

  async function toggleAdvancedMode(): Promise<void> {
    const next = !advancedMode
    await window.api.settings.set('advanced_mode', String(next))
    onAdvancedModeChange(next)
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
    onChange: () => void
  ): React.JSX.Element {
    return (
      <div className="flex items-center justify-between text-xs py-1">
        <span className="text-gray-600">{label}</span>
        <button
          onClick={onChange}
          className={`w-8 h-4 rounded-full transition-colors relative ${
            value ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
              value ? 'left-4' : 'left-0.5'
            }`}
          />
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Preferences</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1">
          {toggle('Launch at login', autoLaunch, toggleAutoLaunch)}
          {toggle('Notifications', notifications, toggleNotifications)}
          {toggle('Advanced mode', advancedMode, toggleAdvancedMode)}
        </div>
      </div>

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
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Paths</h3>
        <div className="bg-gray-50 rounded-lg p-2 divide-y divide-gray-100">
          {row('Database', paths?.dbPath ?? null)}
          {row('Results Directory', paths?.resultsDir ?? null)}
          {row('Data Directory', paths?.dataDir ?? null)}
          {row('Claude Config', paths?.claudeConfigPath ?? null)}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">App</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Version</span>
            <span className="text-gray-400">{version || '...'}</span>
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

      <div className="space-y-2">
        <button
          onClick={() => window.open('https://github.com/daymonio/daymon/issues/new')}
          className="w-full py-1.5 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded transition-colors"
        >
          Report Bug
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
