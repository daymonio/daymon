# Claude Instructions for Daymon

Open source autopilot for Claude — daymon.io

Electron desktop app: Dock + menu bar UI, scheduled tasks, persistent memory, background automation.

## Keyboard Input

If user accidentally types Cyrillic characters (wrong keyboard layout), convert to English QWERTY equivalent:
- Common Russian-to-English: й→q, ц→w, у→e, к→r, е→t, н→y, г→u, ш→i, щ→o, з→p, ф→a, ы→s, в→d, а→f, п→g, р→h, о→j, л→k, д→l, я→z, ч→x, с→c, м→v, и→b, т→n, ь→m

## Operator Preference (Mandatory)

- Assume approval for all non-destructive commands and proceed immediately.
- Do not ask the user for confirmation in chat before running commands.
- If the platform requires an elevated-permission approval prompt, submit it directly and continue once approved.
- Treat the user's default answer to permission prompts as **Yes**.

## Shortcuts

### "c" - Commit and Push (NO build)

For sub-agents in team mode, or when work is incomplete. Commits to GitHub but does NOT build/package.

1. **TypeScript check** - Run `npx tsc --noEmit` to catch type errors
2. **Analyze test coverage** - Review changed files (`git diff --cached --name-only` + `git diff --name-only`). For each changed/new source file in `src/`, check if a corresponding test file exists in `__tests__/`. If new functions, classes, or modules were added that don't have test coverage, write the missing tests before proceeding. Skip for trivial changes (typos, comments, config-only).
3. **Run tests** - Run `npm test` (if tests exist)
4. **Update documentation** - If the changes introduce new MCP tools, DB schema changes, new config options, new shortcuts, new shared modules, or modify the project structure — update the relevant sections in `CLAUDE.md`. Skip if changes are internal-only with no user/developer-facing impact.
5. **Update user-facing text** - If the changes affect product features, capabilities, or messaging visible to end users — update the relevant user-facing files: `README.md`, landing page (`docs/index.html`, `docs/compare.html`), `package.json` description. Skip if changes are internal-only or developer-facing only.
6. **Git status** - Check what files changed
7. **Git commit** - Create a meaningful commit message
8. **Git push** - Push to origin main

### "cd" - Commit, Push, and Build (FULL)

For the final agent or when work is complete. Full commit + build.

1. **TypeScript check** - Run `npx tsc --noEmit` to catch type errors
2. **Analyze test coverage** - Review changed files (`git diff --cached --name-only` + `git diff --name-only`). For each changed/new source file in `src/`, check if a corresponding test file exists in `__tests__/`. If new functions, classes, or modules were added that don't have test coverage, write the missing tests before proceeding. Skip for trivial changes (typos, comments, config-only).
3. **Run tests** - Run `npm test` (if tests exist)
4. **Update documentation** - If the changes introduce new MCP tools, DB schema changes, new config options, new shortcuts, new shared modules, or modify the project structure — update the relevant sections in `CLAUDE.md`. Skip if changes are internal-only with no user/developer-facing impact.
5. **Update user-facing text** - If the changes affect product features, capabilities, or messaging visible to end users — update the relevant user-facing files: `README.md`, landing page (`docs/index.html`, `docs/compare.html`), `package.json` description. Skip if changes are internal-only or developer-facing only.
6. **Git status** - Check what files changed
7. **Git commit** - Create a meaningful commit message
8. **Git push** - Push to origin main
9. **Build** - Run `npm run build` and WAIT for build to complete:
   - If build succeeds: Done
   - If build fails: Read error from output, fix the issue, and repeat from step 6

**CRITICAL**: Do NOT tell user "done" until build succeeds.

### "cr" - Commit, Build, Bump & Tag

For releases. Full commit + build + version bump + git tag.

1. **TypeScript check** - Run `npx tsc --noEmit` to catch type errors
2. **Analyze test coverage** - Review changed files (`git diff --cached --name-only` + `git diff --name-only`). For each changed/new source file in `src/`, check if a corresponding test file exists in `__tests__/`. If new functions, classes, or modules were added that don't have test coverage, write the missing tests before proceeding. Skip for trivial changes (typos, comments, config-only).
3. **Run tests** - Run `npm test` (if tests exist)
4. **Update documentation** - If the changes introduce new MCP tools, DB schema changes, new config options, new shortcuts, new shared modules, or modify the project structure — update the relevant sections in `CLAUDE.md`. Skip if changes are internal-only with no user/developer-facing impact.
5. **Update user-facing text** - If the changes affect product features, capabilities, or messaging visible to end users — update the relevant user-facing files: `README.md`, landing page (`docs/index.html`, `docs/compare.html`), `package.json` description. Skip if changes are internal-only or developer-facing only.
6. **Git status** - Check what files changed
7. **Git commit** - Create a meaningful commit message
8. **Git push** - Push to origin main
9. **Build** - Run `npm run build` and WAIT for build to complete:
   - If build succeeds: Continue
   - If build fails: Read error from output, fix the issue, and repeat from step 6
10. **Bump version** - Run `npm version patch` (creates commit + git tag `vX.Y.Z` automatically). Use `minor` or `major` instead of `patch` if the user specifies.
11. **Push tags** - Run `git push origin main --tags`

### Team Mode (Parallel Agents)

When multiple agents work in parallel on different tasks:
- **Sub-agents**: Use `c` to commit their work (no build)
- **Orchestrator/Final agent**: Use `cd` to build after all agents complete
- This prevents building incomplete code or triggering multiple builds

## Git Setup

- Remote: `git@github.com:daymonio/daymon.git` (SSH)
- Push with: `git push origin main`
- **ALWAYS check TypeScript before committing**: Run `npx tsc --noEmit` before pushing.

## Tech Stack

- **Desktop**: Electron (menu bar / tray app) — thin UI shell
- **Sidecar**: Standalone Node.js HTTP server — runs cron, file watchers, task execution, embeddings
- **UI**: React + Tailwind CSS
- **MCP Server**: TypeScript (MCP SDK) — stdio transport
- **Database**: better-sqlite3 + sqlite-vec (local, zero config, native vector search, WAL mode for multi-process)
- **Scheduler**: node-cron (in sidecar process)
- **File Watcher**: Native `fs.watch()` with FSEvents (in sidecar process)
- **Task Executor**: child_process → Claude Code CLI (in sidecar + MCP, never Electron)
- **Packaging**: electron-builder (DMG for Mac, NSIS for Windows)

## Control Modes

Daymon can be controlled from three places:

| Mode | Transport | Execution | Source Tag |
|------|-----------|-----------|------------|
| **Claude Code** | MCP stdio via `.mcp.json` | Direct (spawns `claude -p`) | `claude-code` |
| **Claude Desktop** | MCP stdio via `claude_desktop_config.json` | Direct (spawns `claude -p`) | `claude-desktop` |
| **Daymon UI** | Electron IPC → Sidecar HTTP | Via sidecar process | `daymon` |

### Claude Code Integration

The `.mcp.json` in the project root connects Claude Code to Daymon's MCP server:
- `DAYMON_DB_PATH` — path to the shared SQLite database
- `DAYMON_SOURCE` — set to `claude-code` to tag task origin
- `daymon_run_task` executes tasks directly (no Electron needed)
- Cron/scheduled tasks still require the Electron app running

### Architecture: Sidecar Pattern

Electron's patched Node.js runtime causes `spawn EBADF` on all `child_process` calls. To fix this, all process-spawning work runs in a **sidecar** — a standalone Node.js HTTP server that Electron launches as a detached process.

```
Electron (thin UI shell)                 Sidecar (stock Node.js)
├── Tray + popover window                ├── HTTP server on 127.0.0.1 (random port)
├── IPC bridge to React renderer         ├── Cron scheduler (node-cron)
├── Native notifications (via SSE)       ├── Task execution (spawn claude)
├── Auto-updater                         ├── File watchers (native fs.watch)
├── Auto-launch                          ├── Embedding indexer
├── Direct DB reads (fast UI)            ├── Auto-nudge (osascript)
│                                        └── Own SQLite connection (WAL)
├── Launch sidecar (detached spawn)
├── HTTP client → sidecar API
└── SSE listener for task events
```

- **Port discovery**: Sidecar writes port to `{dataDir}/sidecar.port`, PID to `{dataDir}/sidecar.pid`
- **Health check**: Electron polls `GET /health` every 30s, auto-restarts after 3 failures
- **SSE events**: `GET /events` pushes `task:complete` / `task:failed` to Electron for native notifications
- **Endpoints**: `POST /tasks/:id/run`, `POST /sync` (re-sync cron + watches), `POST /shutdown`
- **Shared modules**: `src/shared/` (claude-code.ts, task-runner.ts, db-queries.ts) used by both sidecar and MCP server — no Electron deps

## Memory-Aware Task Execution

Tasks are **not isolated** — they have access to Daymon's memory system. Before each run, the task runner automatically injects relevant context into the prompt. After each run, it stores results back into memory.

### How it works

1. **Before execution**: `getTaskMemoryContext()` builds a context block:
   - **Own history** — last 5 observations from the task's linked memory entity ("Your previous results")
   - **Cross-task knowledge** — FTS search across ALL memory using each word from the task name ("Related knowledge" — other task results, user-stored memories, preferences)
2. **Context is prepended** to the prompt: `{context}\n\n---\n\n{original prompt}`
3. **After execution**: `storeTaskResultInMemory()` saves the output as a new observation
   - Entity: `"Task: {name}"`, type `task_result`, category `task`
   - Results truncated to 2000 chars, observations pruned to 10 max per task
   - Source tagged as `task_runner` (distinct from user-created memories)
4. **Cross-conversation**: Task results are discoverable via `daymon_recall` in any chat

### Memory is non-fatal

All memory operations are wrapped in try/catch — if memory fails, the task still executes normally. Memory is an enhancement, never a blocker.

### DB Schema (V4–V13)

```
memory_entity_id  INTEGER  — FK to entities.id, links task to its memory entity (V4)
worker_id         INTEGER  — FK to workers.id, assigned worker (V5)
session_continuity INTEGER — 1 = resume sessions across runs (V5)
session_id        TEXT     — current Claude CLI session ID (V5)
timeout_minutes   INTEGER  — per-task timeout in minutes, NULL = default 30 (V6)
max_turns         INTEGER  — max agentic turns per run, NULL = unlimited (V9)
allowed_tools     TEXT     — comma-separated list of allowed tools, NULL = all (V10)
disallowed_tools  TEXT     — comma-separated list of blocked tools, NULL = none (V10)
nudge_mode        TEXT     — per-task nudge: 'always' (default), 'failure_only', 'never' (V12)
```

Workers table (V13):
```
role              TEXT     — optional worker role/title (V13)
```

### Key files

- `src/shared/db-queries.ts` — `getTaskMemoryContext()`, `ensureTaskMemoryEntity()`, `storeTaskResultInMemory()`, `incrementRunCount()`
- `src/shared/task-runner.ts` — injects context before Claude call, stores result after, resolves workers, handles session continuity

## Task Scheduling

### Trigger Types

| Type | How it works | Auto-completes? |
|------|-------------|-----------------|
| **cron** | Runs on a schedule (`cronExpression`) | Only if `maxRuns` is set |
| **once** | Runs at a specific time (`scheduledAt`) | Yes, after execution |
| **manual** | On-demand via `daymon_run_task` | Only if `maxRuns` is set |

### Max Runs

Tasks can have an optional `maxRuns` limit. When set, the task auto-completes after N **successful** executions. Failed runs do not count toward the limit.

- `maxRuns: null` (default) — runs unlimited times
- `maxRuns: 1` — runs once then completes
- `maxRuns: N` — runs N times then completes
- `runCount` tracks successful executions, incremented in `src/shared/task-runner.ts`
- UI shows "X / Y runs" in TasksPanel when maxRuns is set

### Task Execution Controls

Tasks support fine-grained execution constraints passed to the Claude CLI:

- **`maxTurns`** — limits agentic turns (CLI `--max-turns`). Prevents runaway tasks. Example: `maxTurns: 25`
- **`allowedTools`** — comma-separated whitelist (CLI `--allowedTools`). Only these tools are available. Example: `"Read,Grep,Glob"` for read-only tasks
- **`disallowedTools`** — comma-separated blocklist (CLI `--disallowedTools`). These tools are blocked. Example: `"WebFetch"` to force WebSearch-only (avoids slow URL fetches)

Common patterns:
- **Research tasks** (HN digest, competitor tracking): `disallowedTools: "WebFetch"` — WebSearch-only, no hanging
- **Code review tasks**: `allowedTools: "Read,Grep,Glob"` — read-only, no modifications
- **Analysis tasks**: `disallowedTools: "Edit,Write"` — can read and run commands but won't modify files

### DB Schema (V13)

The tasks table has these scheduling-relevant columns:

```
trigger_type       TEXT     — 'cron', 'once', or 'manual'
cron_expression    TEXT     — cron schedule (e.g. '0 9 * * *')
scheduled_at       DATETIME — one-time execution time (V2)
max_runs           INTEGER  — auto-complete after N successful runs, NULL = unlimited (V3)
run_count          INTEGER  — number of successful executions so far (V3)
memory_entity_id   INTEGER  — FK to entities.id, links task to its memory entity (V4)
worker_id          INTEGER  — FK to workers.id, assigned worker (V5)
session_continuity INTEGER  — 1 = resume Claude CLI sessions across runs (V5)
session_id         TEXT     — current session ID for continuity (V5)
timeout_minutes    INTEGER  — per-task timeout in minutes, NULL = default 30 (V6)
max_turns          INTEGER  — max agentic turns per run, NULL = unlimited (V9)
allowed_tools      TEXT     — comma-separated allowed tools, NULL = all (V10)
disallowed_tools   TEXT     — comma-separated blocked tools, NULL = none (V10)
nudge_mode         TEXT     — 'always' (default), 'failure_only', or 'never' (V12)
status             TEXT     — 'active', 'paused', or 'completed'
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `daymon_schedule` | Create task (cron/once/manual). Params: `prompt`, `cronExpression?`, `scheduledAt?`, `maxRuns?`, `maxTurns?`, `allowedTools?`, `disallowedTools?`, `nudge?`, `name?`, `description?`, `workerId?`, `sessionContinuity?`, `timeout?` |
| `daymon_run_task` | Execute a task immediately by ID (async — returns instantly, runs in background) |
| `daymon_list_tasks` | List all tasks (includes `maxRuns`, `runCount`, worker info) |
| `daymon_pause_task` | Pause a task |
| `daymon_resume_task` | Resume a paused task |
| `daymon_delete_task` | Delete a task and its run history |
| `daymon_task_history` | Show recent runs for a task |
| `daymon_task_progress` | Check progress of a running task |
| `daymon_reset_session` | Clear session for a task (forces fresh start) |
| `daymon_remember` | Store a memory (entity + observation) |
| `daymon_recall` | Search memories by keyword (FTS + semantic hybrid search) |
| `daymon_forget` | Delete a memory entity and its observations |
| `daymon_memory_list` | List all memories, optionally filtered by category |
| `daymon_create_worker` | Create a worker with name, role, system prompt, description |
| `daymon_list_workers` | List all workers |
| `daymon_update_worker` | Update a worker's name, role, prompt, or description |
| `daymon_delete_worker` | Delete a worker |
| `daymon_watch` | Watch a file/folder for changes |
| `daymon_unwatch` | Stop watching a file/folder |
| `daymon_list_watches` | List all active watches |
| `daymon_get_setting` | Get a setting value by key |
| `daymon_set_setting` | Set a setting value (e.g. `auto_nudge_quiet_hours`) |

## Workers

Workers are named agent configs with system prompts. Each worker has a required **name** (e.g., "John") and an optional **role** (e.g., "Chief of Staff"). The name is always shown primary, role as subtitle when set. Each worker defines a personality, values, and anti-patterns that shape how tasks execute.

### Resolution order

Task's `workerId` > default worker (if any) > no worker

### How it works

- Worker's system prompt is passed via Claude CLI's `--system-prompt` flag (kept separate from task prompt)
- 9 built-in templates available in UI (Chief of Staff, Researcher, Code Reviewer, Writer, Email Assistant, Tech Trend Analyst, Competitor Tracker, DevOps, Data Analyst)
- Users can create custom workers or edit templates

### Key files

- `src/shared/db-queries.ts` — Worker CRUD: `createWorker`, `getWorker`, `listWorkers`, `updateWorker`, `deleteWorker`, `getDefaultWorker`
- `src/shared/task-runner.ts` — resolves worker and passes `systemPrompt` + optional `model` to executor
- `src/mcp/tools/workers.ts` — MCP tools for worker management
- `src/renderer/src/components/WorkersPanel.tsx` — UI with templates + CRUD

## Session Continuity

Tasks can optionally resume Claude CLI sessions across runs using `--resume <session-id>`.

- **Enable**: `sessionContinuity: true` when creating a task
- **Session rotation**: fresh session after 20 consecutive runs (prevents context overflow)
- **Error recovery**: if `--resume` fails, retries without session and clears the stored ID
- **Reset**: use `daymon_reset_session` tool to force a fresh start

### Session-aware memory

- First run (no session yet): full memory injection (own history + cross-task)
- Subsequent runs: only cross-task knowledge (session already has own history)

### Key files

- `src/shared/claude-code.ts` — `ExecutionOptions` interface with `resumeSessionId`, `systemPrompt`, `maxTurns`, `allowedTools`, `disallowedTools`; `ExecutionResult` with `sessionId`
- `src/shared/task-runner.ts` — session lifecycle: resume/store/rotate/retry

## Auto-Nudge (Auto-Show Results)

When a task completes, Daymon can automatically show results in the active Claude Code chat. Uses macOS `osascript` to activate the IDE, focus Claude Code input (Cmd+L), and type a trigger message.

### Per-Task Nudge Mode

Each task has a `nudge_mode` that controls when it triggers auto-nudge:

| Mode | Behavior |
|------|----------|
| `always` (default) | Nudge on every completion (success + failure) |
| `failure_only` | Only nudge when the task fails (ideal for monitoring/health checks) |
| `never` | Never nudge |

- **MCP**: `daymon_schedule` has a `nudge` param (enum: always/failure_only/never)
- **UI**: Each task card has a nudge mode dropdown
- **Logic**: `shouldNudgeTask(nudgeMode, success)` in `src/shared/auto-nudge.ts`

### How it works

1. Task completes (success or failure) in either MCP server or sidecar
2. Checks task's `nudge_mode` via `shouldNudgeTask()`
3. Checks quiet hours (orthogonal gate)
4. If allowed, detects running IDE (Cursor, VSCode, VSCode Insiders) by bundle ID
5. Activates the IDE, sends Cmd+L to focus Claude Code input
6. Types: `Daymon task "..." (id: N) completed successfully in Xs. Show me the results using daymon_task_history.`
7. Claude reacts by calling `daymon_task_history` and displaying results

### Quiet Hours

Suppress nudges during set hours to avoid mixing with user typing. Quiet hours are a global setting that applies on top of per-task nudge mode.

- **Settings**: `auto_nudge_quiet_hours` (true/false), `auto_nudge_quiet_from` (HH:MM, default 08:00), `auto_nudge_quiet_until` (HH:MM, default 22:00)
- Supports inverted ranges (e.g., 22:00–08:00 for nighttime quiet)
- UI: Settings tab toggle with time pickers

### Nudge Queue

When multiple tasks complete simultaneously, nudges are serialized via an async queue with a 3s gap between messages. This prevents concurrent osascript keystrokes from mixing.

### Requirements

- macOS only (uses `osascript`)
- Accessibility permissions for System Events keystroke automation
- IDE must be running (Cursor, VSCode, or VSCode Insiders)

### Key files

- `src/shared/auto-nudge.ts` — `shouldNudgeTask()`, `nudgeClaudeCode()`, `isInQuietHours()`, `enqueueNudge()`, IDE detection
- `src/mcp/tools/scheduler.ts` — nudge in `daymon_run_task` fire-and-forget `.then()` handler
- `src/sidecar/notifications.ts` — nudge in sidecar task completion callbacks
- `src/mcp/tools/settings.ts` — `daymon_get_setting` / `daymon_set_setting` MCP tools (quiet hours)

## Project Structure

```
daymon/
├── src/
│   ├── main/                    # Electron main process (thin UI shell)
│   │   ├── index.ts             # App entry, tray setup, sidecar launch
│   │   ├── tray.ts              # Menu bar icon + popover
│   │   ├── sidecar.ts           # Sidecar lifecycle (launch, HTTP client, SSE, health check)
│   │   ├── notifications.ts     # Native Notification display (triggered by SSE events)
│   │   ├── ipc.ts               # IPC handlers (DB reads + sidecar HTTP for execution)
│   │   └── db/                  # SQLite database layer (Electron wrappers for UI reads)
│   ├── sidecar/                 # Standalone Node.js sidecar (all process-spawning work)
│   │   ├── server.ts            # HTTP server entry point (routes, DB init, lifecycle)
│   │   ├── scheduler.ts         # Cron scheduler (node-cron, one-time tasks, embedding indexer)
│   │   ├── file-watcher.ts      # File watchers (native fs.watch + FSEvents, debounce)
│   │   ├── events.ts            # SSE event emitter (task:complete, task:failed)
│   │   ├── notifications.ts     # SSE emission + auto-nudge triggers
│   │   └── __tests__/           # Sidecar unit tests (events, notifications, scheduler, server)
│   ├── mcp/                     # Standalone MCP server (stdio)
│   │   ├── server.ts            # Entry point (stdio)
│   │   ├── db.ts                # DB init from DAYMON_DB_PATH env var
│   │   └── tools/               # MCP tools (memory, scheduler, workers, watcher, settings)
│   ├── renderer/                # React UI
│   │   ├── App.tsx
│   │   └── components/          # StatusPanel, MemoryPanel, WorkersPanel, TasksPanel, etc.
│   └── shared/                  # Shared between Sidecar + MCP (no Electron deps)
│       ├── claude-code.ts       # Executor: spawns `claude -p` CLI (session, tools, turns)
│       ├── task-runner.ts       # Task orchestration (create run → execute → save, workers, sessions)
│       ├── auto-nudge.ts        # Auto-show results in Claude Code via osascript
│       ├── db-queries.ts        # Pure DB query functions (tasks, workers, memory, embeddings)
│       ├── embeddings.ts        # Local vector embeddings (HuggingFace transformers)
│       ├── embedding-indexer.ts # Background batch embedding processor
│       ├── db-migrations.ts     # DB schema migrations (V1–V13)
│       ├── types.ts             # Shared TypeScript types
│       └── constants.ts         # App constants
├── .mcp.json                    # Claude Code MCP server config
├── scripts/                     # Setup scripts
├── resources/                   # App icons, tray icons
├── electron-builder.yml
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

## Development Workflow

### Running the Electron App

**ALWAYS use `npm run dev`** — NEVER run `electron-vite dev` or `npx electron-vite dev` directly.

```bash
# From a regular terminal (NOT from Claude Code):
source ~/.nvm/nvm.sh && nvm use 20 && npm run dev
```

`npm run dev` does three things automatically:
1. Kills stale Electron/Daymon processes (`dev:clean`)
2. Rebuilds `better-sqlite3` for Electron's ABI (`rebuild:native:electron`)
3. Unsets `ELECTRON_RUN_AS_NODE` and starts `electron-vite dev`

**Why not from Claude Code?** Claude Code sets `ELECTRON_RUN_AS_NODE=1` which makes Electron run as plain Node.js instead of a GUI app. The `npm run dev` script unsets it, but only for the child process — if you run it via Claude Code's Bash tool, the background shell may still inherit it. Always launch from a separate terminal.

**ABI mismatch errors**: If you see `NODE_MODULE_VERSION` errors, it means `better-sqlite3` was compiled for the wrong Node.js version. `npm run dev` prevents this by rebuilding automatically. If it still happens, run `npm run rebuild:native:electron` manually.

### Server Commands

```bash
# Development
npm run dev               # Clean + rebuild native deps + start Electron (USE THIS)
npm run dev:clean         # Kill stale Electron/Daymon/MCP processes
npm run rebuild:native:electron  # Rebuild better-sqlite3 for Electron ABI

# Build
npm run build             # Full build (main + renderer + MCP server)
npm run build:mcp         # Rebuild MCP server + sidecar (after changing src/mcp/, src/sidecar/, or src/shared/)

# Package
npm run build:mac         # Build + package macOS DMG
npm run build:win         # Build + package Windows
npm run build:linux       # Build + package Linux
```

### Rebuilding After Changes

- **Changed `src/mcp/`, `src/sidecar/`, or `src/shared/`?** → Run `npm run build:mcp` to rebuild MCP server + sidecar bundles. Both run from `out/mcp/` (bundled by esbuild), NOT from source — changes have no effect until rebuilt.
- **Changed `src/main/` or `src/renderer/`?** → `npm run dev` hot-reloads automatically (electron-vite watches source files).
- **Changed both?** → Run `npm run build:mcp` then restart `npm run dev`.

### Testing Requirements

**CRITICAL: Every feature MUST be tested before telling user it's done.**

- Run `npm run typecheck` after TypeScript changes
- Run `npm test` before committing
- Test Electron IPC interactions manually when modifying main↔renderer communication
- Test MCP tools from Claude Code (via `.mcp.json`) or Claude Desktop

## Landing Page (daymon.io)

- Hosted on **GitHub Pages** from this repo
- Deploy: push to `main`, served from `docs/` folder or `gh-pages` branch
- Custom domain: daymon.io

## License

- **MIT License** — free and open source

### Do NOT Tell User "Done" Until:
- TypeScript compiles without errors
- Tests pass (if they exist)
- Feature works in the running Electron app (verified)

## Progress Tracking — MANDATORY

**CRITICAL: PROGRESS.md is the source of truth for all work. EVERY task — no matter how small — MUST be logged there. Failure to update PROGRESS.md is a violation of project rules.**

A shared progress file exists at `PROGRESS.md` in the project root.

### BEFORE writing ANY code or making ANY changes:

1. **Read `PROGRESS.md`** — check what's already done, what's in progress, avoid duplicating work
2. **Add a new section header** for your task (e.g., `## Worker Role Field`)
3. **List ALL planned tasks** as unchecked `- [ ]` items with your agent name BEFORE you start executing:
   ```
   ## Worker Role Field
   - [ ] Add DB migration V13 (@executor)
   - [ ] Update types and validation (@executor)
   - [ ] Update DB queries (@executor)
   - [ ] Update MCP tools (@executor)
   - [ ] Update UI components (@executor)
   - [ ] Write tests (@executor)
   - [ ] Typecheck + test + build (@executor)
   ```
4. **Only AFTER writing tasks to PROGRESS.md** may you begin implementation

### DURING execution:

- Mark each task `[x]` **immediately** after completing it — do NOT batch completions
- If you discover new sub-tasks during work, add them as new `- [ ]` items before doing them

### Rules:

- Do NOT remove or reorder existing items. Only add new items and mark them complete.
- Do NOT skip this step for "small" changes — ALL work gets logged.
- Agent names: use a short descriptive label (e.g., `@executor`, `@refactor`, `@tests`, `@docs`)
- This applies to EVERY agent, including sub-agents in team mode.
