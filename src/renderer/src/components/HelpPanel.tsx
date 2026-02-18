export function HelpPanel(): React.JSX.Element {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Creating Tasks</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1.5 text-xs text-gray-600 leading-relaxed">
          <p>
            <span className="font-medium text-gray-700">From chat</span> — ask Claude to create a task for you
            in Claude Code or Claude Desktop. Just describe what you want and Claude will set it up.
          </p>
          <p>
            <span className="font-medium text-gray-700">From Daymon</span> — open the Tasks tab and click
            &quot;+ New Task&quot; to create tasks with a form.
          </p>
          <p className="text-gray-400 text-[10px]">
            Example: &quot;Schedule a task to check Hacker News every morning at 9am and summarize the top stories.&quot;
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Auto-Nudge</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1.5 text-xs text-gray-600 leading-relaxed">
          <p>
            When a task finishes, Daymon can automatically show you the results in your Claude Code chat
            — no need to check manually.
          </p>
          <p>
            Three modes per task:{' '}
            <span className="font-medium text-green-600">Always</span> (notify every time),{' '}
            <span className="font-medium text-orange-600">Failure only</span> (only when something goes wrong — great for monitoring tasks),{' '}
            <span className="font-medium text-gray-600">Never</span>.
            Set quiet hours in Settings to pause notifications.
          </p>
          <p className="text-gray-400 text-[10px]">
            Example: you have a task that checks if your website is up every hour. Set it to &quot;Failure only&quot;
            — Daymon stays silent when everything is fine, but pops up in your chat the moment the site goes down.
          </p>
          <p className="text-gray-400 text-[10px]">
            {window.api.app.getPlatform() === 'linux'
              ? 'Requires xdotool for auto-nudge. Install with: sudo apt install xdotool (X11 only).'
              : window.api.app.getPlatform() === 'win32'
              ? 'Uses PowerShell for auto-nudge. Works out of the box on Windows 10+.'
              : 'Requires accessibility permission on macOS. Grant in System Settings \u2192 Privacy & Security \u2192 Accessibility.'}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Workers</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1.5 text-xs text-gray-600 leading-relaxed">
          <p>
            Workers are custom personas you can assign to tasks. Each worker has instructions that
            shape how it behaves — like a researcher, writer, or code reviewer.
          </p>
          <p>
            Set one worker as <span className="font-medium">default</span> and it will be used for
            all tasks automatically. Pick from built-in templates or create your own in the Workers tab.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-1">Key Concepts</h3>
        <div className="bg-gray-50 rounded-lg p-2 space-y-1 text-xs text-gray-600">
          <div className="flex gap-1.5">
            <span className="font-medium text-gray-700 shrink-0">Memory</span>
            <span className="text-gray-500">— Daymon remembers things across tasks and conversations</span>
          </div>
          <div className="flex gap-1.5">
            <span className="font-medium text-gray-700 shrink-0">Sessions</span>
            <span className="text-gray-500">— tasks can pick up where they left off between runs</span>
          </div>
          <div className="flex gap-1.5">
            <span className="font-medium text-gray-700 shrink-0">Watches</span>
            <span className="text-gray-500">— run a task automatically when a file or folder changes</span>
          </div>
          <div className="flex gap-1.5">
            <span className="font-medium text-gray-700 shrink-0">Advanced</span>
            <span className="text-gray-500">— turn on in Settings to see extra tabs and detailed info</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
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
      </div>
    </div>
  )
}
