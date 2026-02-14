# Daymon

**Open source autopilot for Claude.**

Scheduled tasks, persistent memory, background automation. No API keys. No cloud. Runs on your Mac.

[daymon.io](https://daymon.io)

---

## What is Daymon?

Daymon is a macOS menu bar app that supercharges Claude via the Model Context Protocol (MCP). It gives your AI persistent memory, scheduled tasks, and file watchers — all running locally on your machine.

Your Claude subscription only works when you do. Daymon puts it to work 24/7.

## Features

**Scheduled Tasks** — "Every weekday at 9am, check HackerNews for AI news." Create recurring, one-time, or on-demand tasks by talking to Claude. Daymon runs them on schedule using Claude Code CLI.

**Persistent Memory** — Remember something in Claude, recall it later. Knowledge graph with entities, observations, and relations.

**File Watchers** — "When a new file appears in Downloads, organize it." Daymon watches folders and acts automatically.

**100% Local** — Everything on your Mac. No cloud. No account. Your data is a SQLite file you can inspect anytime.

**Real-Time Progress** — See task execution progress in real-time with step-by-step updates.

## Installation

### Download

Download the latest `.dmg` from [GitHub Releases](https://github.com/daymonio/daymon/releases).

### Build from Source

```bash
git clone https://github.com/daymonio/daymon.git
cd daymon
npm install
npm run dev      # Development mode
npm run build    # Production build
```

## How It Works

1. **Install Daymon** — menu bar icon appears
2. **Claude gains superpowers** via MCP tools
3. **Schedule tasks** — "Every morning, summarize my inbox"
4. **Your subscription works while you sleep**

Daymon auto-configures Claude Desktop on first launch. Zero setup.

## MCP Tools

### Memory

| Tool | Description |
|------|-------------|
| `daymon_remember` | Store a fact, preference, or project detail |
| `daymon_recall` | Search memories by keyword |
| `daymon_forget` | Delete a memory |
| `daymon_memory_list` | List all stored memories |

### Scheduler

| Tool | Description |
|------|-------------|
| `daymon_schedule` | Create a task (recurring, one-time, or on-demand) |
| `daymon_list_tasks` | Show all tasks |
| `daymon_run_task` | Manually trigger a task |
| `daymon_pause_task` | Pause a task |
| `daymon_resume_task` | Resume a paused task |
| `daymon_delete_task` | Delete a task |
| `daymon_task_history` | Show past runs |
| `daymon_task_progress` | Check running task progress |

### File Watching

| Tool | Description |
|------|-------------|
| `daymon_watch` | Watch a folder for changes |
| `daymon_unwatch` | Stop watching |
| `daymon_list_watches` | List active watches |

## Development

```bash
npm run dev          # Start Electron in dev mode
npm run build        # Full build (main + renderer + MCP)
npm test             # Run test suite
npm run typecheck    # TypeScript type checking
npm run build:mac    # Build + package macOS DMG
```

### Project Structure

```
daymon/
├── src/
│   ├── main/           # Electron main process
│   │   ├── scheduler/  # node-cron task scheduling
│   │   ├── executor/   # Claude Code CLI runner
│   │   └── db/         # SQLite database layer
│   ├── mcp/            # MCP server (stdio)
│   │   └── tools/      # Memory, scheduler, watcher tools
│   ├── renderer/       # React + Tailwind UI
│   └── shared/         # Types, schema, constants
├── docs/               # Landing page (daymon.io)
└── resources/          # App icons
```

### Tech Stack

- **Desktop**: Electron (menu bar / tray app)
- **UI**: React + Tailwind CSS
- **MCP**: TypeScript (MCP SDK) — stdio transport
- **Database**: better-sqlite3
- **Scheduler**: node-cron
- **File Watcher**: chokidar
- **Executor**: Claude Code CLI
- **Packaging**: electron-builder
- **Testing**: Vitest

## License

MIT License. See [LICENSE](LICENSE) for details.
