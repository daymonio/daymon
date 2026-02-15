# Daymon

**Open source autopilot for Claude.**

Scheduled tasks, persistent memory, background automation. No API keys. No cloud. Runs on your Mac.

[daymon.io](https://daymon.io)

---

## What is Daymon?

Daymon is a macOS app that lives in your menu bar and Dock. Persistent memory, scheduled tasks, workers, and file watchers — all running locally on your machine. Works with Claude Desktop and Claude Code.

Your Claude subscription only works when you do. Daymon puts it to work 24/7.

## Features

**Scheduled Tasks** — "Every weekday at 9am, check HackerNews for AI news." Create recurring, one-time, or on-demand tasks by talking to Claude. Daymon runs them on schedule using Claude Code CLI.

**Workers** — Named agent personalities with system prompts. Assign a Researcher, Chief of Staff, Code Reviewer, or your own custom worker to any task. 9 templates included — each with opinionated values, behaviors, and anti-patterns.

**Session Continuity** — Tasks can resume where they left off. Enable session continuity and each run builds on the previous one — "compare today's results to yesterday's" just works. Auto-rotates after 20 runs.

**Persistent Memory** — Remember something in Claude, recall it later. Knowledge graph with semantic search (local embeddings, no API keys). Tasks auto-inject memory context and store results back.

**File Watchers** — "When a new file appears in Downloads, organize it." Daymon watches folders and acts automatically.

**100% Local** — Everything on your Mac. No cloud. No account. Your data is a SQLite file you can inspect anytime.

**Real-Time Progress** — See task execution progress in real-time with step-by-step updates.

## Installation

### Homebrew (recommended)

```bash
brew install daymonio/daymon/daymon
```

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

1. **Install Daymon** — menu bar + Dock icon appear
2. **Claude gains superpowers** — memory, scheduling, workers, file watching
3. **Schedule tasks** — "Every morning, summarize my inbox"
4. **Your subscription works while you sleep**

Daymon auto-configures Claude Desktop on first launch. Zero setup.

## Tools

Talk to Claude naturally — these tools are available automatically in Claude Desktop and Claude Code after installing Daymon.

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
| `daymon_schedule` | Create a task (recurring, one-time, or on-demand). Supports `workerId`, `sessionContinuity`, `timeout`, `maxRuns`. |
| `daymon_list_tasks` | Show all tasks |
| `daymon_run_task` | Manually trigger a task |
| `daymon_pause_task` | Pause a task |
| `daymon_resume_task` | Resume a paused task |
| `daymon_delete_task` | Delete a task |
| `daymon_task_history` | Show past runs |
| `daymon_task_progress` | Check running task progress |
| `daymon_reset_session` | Clear session for a task (forces fresh start) |

### Workers

| Tool | Description |
|------|-------------|
| `daymon_create_worker` | Create a worker with name, system prompt, description |
| `daymon_list_workers` | List all workers |
| `daymon_update_worker` | Update a worker's name, prompt, or description |
| `daymon_delete_worker` | Delete a worker |

### File Watching

| Tool | Description |
|------|-------------|
| `daymon_watch` | Watch a folder for changes |
| `daymon_unwatch` | Stop watching |
| `daymon_list_watches` | List active watches |

## Workers

Workers are named agent profiles with system prompts. Each worker defines a personality, values, and anti-patterns that shape how tasks execute.

### Built-in templates

| Template | Description |
|----------|-------------|
| Chief of Staff | Proactive business ops — triages, anticipates needs, proposes actions |
| Researcher | Deep research with strong opinions — synthesis over summarization |
| Code Reviewer | Catches what linters miss — leads with blockers, no bikeshedding |
| Writer | Sharp writing — cuts fluff, clarity over everything |
| Email Assistant | 3-tier triage (ACT NOW / ACT TODAY / SKIP), drafts replies, never sends |
| Tech Trend Analyst | Tech-only trends + tweet drafts with real takes |
| Competitor Tracker | Reports signal, not noise — silence is a valid report |
| DevOps | Reliability over novelty — boring infrastructure that works |
| Data Analyst | Analysis that drives decisions, not dashboards |

### How to use

1. **Create a worker** — in the Daymon UI (Workers tab) or via Claude: "Create a worker called 'My Analyst' with this system prompt..."
2. **Assign to a task** — when scheduling: "Schedule this task with my Analyst worker"
3. **Set a default** — one worker can be the default for all tasks that don't specify one

Workers inject their system prompt via Claude CLI's `--system-prompt` flag. The prompt stays separate from the task content — clean and composable.

## Session Continuity

Tasks can optionally resume Claude CLI sessions across runs. When enabled, each run continues the previous conversation — the task can reference prior results naturally.

- **Enable**: set `sessionContinuity: true` when creating a task
- **Auto-rotation**: fresh session after 20 consecutive runs (prevents context overflow)
- **Error recovery**: if resume fails, retries without session and clears the stored ID
- **Reset**: use `daymon_reset_session` to force a fresh start

Useful for iterative tasks like daily monitoring, trend analysis, or multi-step research projects.

## Development

```bash
npm run dev          # Start Electron in dev mode
npm run dev:clean    # Kill stale Daymon/Electron/MCP dev processes
npm run rebuild:native:electron  # Rebuild better-sqlite3 for Electron runtime
npm run build        # Full build (main + renderer + MCP)
npm test             # Run test suite
npm run typecheck    # TypeScript type checking
npm run build:mac    # Build + package macOS DMG
```

`npm run dev` now performs `dev:clean` and Electron native dependency rebuild automatically before launch.

### Native Module Troubleshooting

If you see errors like:

`better-sqlite3.node was compiled against a different Node.js version`

run:

```bash
npm run rebuild:native:electron
```

This rebuilds native modules for the Electron ABI used by Daymon.

### Project Structure

```
daymon/
├── src/
│   ├── main/           # Electron main process
│   │   ├── scheduler/  # node-cron task scheduling
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
