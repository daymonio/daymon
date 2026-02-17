import { useState } from 'react'

interface CongratsModalProps {
  onDismiss: () => void
}

export function CongratsModal({ onDismiss }: CongratsModalProps): React.JSX.Element {
  const [closing, setClosing] = useState(false)

  function handleDismiss(): void {
    setClosing(true)
    setTimeout(onDismiss, 200)
  }

  function handleStar(): void {
    window.open('https://github.com/daymonio/daymon')
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
          <span className="text-4xl">&#127881;</span>
        </div>

        <h2 className="text-lg font-bold text-gray-800 text-center mb-2">
          Congratulations!
        </h2>

        <p className="text-sm text-gray-600 text-center mb-1">
          Your first task just completed successfully.
        </p>
        <p className="text-sm text-gray-600 text-center mb-4">
          Daymon is now working for you on autopilot.
        </p>

        <button
          onClick={handleStar}
          className="w-full py-2.5 px-3 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg transition-colors mb-3 cursor-pointer"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-base">&#11088;</span>
            <span className="text-sm font-medium text-yellow-700">Star us on GitHub</span>
          </div>
          <div className="text-xs text-yellow-600 mt-0.5">
            Help other developers discover Daymon
          </div>
        </button>

        <button
          onClick={handleDismiss}
          className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
        >
          Dismiss
        </button>

        <p className="text-xs text-gray-400 text-center mt-3">
          This is the only time you&apos;ll see this message.
        </p>
      </div>
    </div>
  )
}
