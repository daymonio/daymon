import { useState } from 'react'

interface UpdateModalProps {
  status: string
  version?: string
  progress?: number
  onDownload: () => void
  onInstall: () => void
  onDismiss: () => void
}

export function UpdateModal({
  status,
  version,
  progress,
  onDownload,
  onInstall,
  onDismiss
}: UpdateModalProps): React.JSX.Element {
  const [closing, setClosing] = useState(false)

  function handleDismiss(): void {
    setClosing(true)
    setTimeout(onDismiss, 200)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 transition-opacity duration-200 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleDismiss}
    >
      <div
        className={`bg-white rounded-xl shadow-xl mx-4 p-5 max-w-xs w-full transform transition-all duration-200 ${
          closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <span className="text-4xl">&#9889;</span>
        </div>

        <h2 className="text-lg font-bold text-gray-800 text-center mb-2">
          {status === 'available' && 'Update Available'}
          {status === 'downloading' && 'Downloading...'}
          {status === 'ready' && 'Update Ready'}
        </h2>

        {version && (
          <p className="text-sm text-gray-600 text-center mb-4">
            {status === 'available' && `Version ${version} is ready to download.`}
            {status === 'downloading' && `Downloading version ${version}${progress != null ? ` — ${progress}%` : ''}`}
            {status === 'ready' && `Version ${version} has been downloaded.`}
          </p>
        )}

        {status === 'available' && (
          <button
            onClick={onDownload}
            className="w-full py-2.5 px-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors mb-3 cursor-pointer"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-medium text-green-700">Download Update</span>
            </div>
          </button>
        )}

        {status === 'downloading' && (
          <div className="w-full mb-3">
            <div className="h-2 bg-green-100 rounded-full overflow-hidden">
              {progress != null ? (
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              ) : (
                <div className="h-full bg-green-400 rounded-full animate-pulse w-full" />
              )}
            </div>
          </div>
        )}

        {status === 'ready' && (
          <button
            onClick={onInstall}
            className="w-full py-2.5 px-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors mb-3 cursor-pointer"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-medium text-green-700">Install &amp; Restart</span>
            </div>
          </button>
        )}

        <button
          onClick={handleDismiss}
          className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
