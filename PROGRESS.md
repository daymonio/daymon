# Daymon Progress Tracker

All agents MUST update this file when completing a task. Change `[ ]` to `[x]`.

---

## Phase 1: Mac + Claude

### Week 1: Foundation — DONE
- [x] Init Electron + React + Tailwind project
- [x] Menu bar tray app shell (click icon → popover window)
- [x] SQLite database setup with full schema
- [x] Database CRUD layer (memory.ts, tasks.ts)
- [x] Config module with macOS paths
- [x] Basic IPC bridge (main ↔ renderer)

### Week 2: MCP Server + Memory — DONE
- [x] MCP server with stdio transport
- [x] Memory tools: daymon_remember, daymon_recall, daymon_forget, daymon_memory_list
- [x] Auto-patch Claude Desktop config on first launch
- [x] Test: talk to Claude, store/retrieve memories
- [x] Memory search (basic keyword matching on SQLite FTS5)

### Week 3: Scheduler + Task Execution — DONE
- [x] Scheduler tools: daymon_schedule, daymon_list_tasks, daymon_pause_task, daymon_delete_task (+daymon_resume_task, daymon_task_history)
- [x] node-cron engine in main process (30s DB polling)
- [x] Claude Code CLI executor (spawn `claude -p "prompt"`)
- [x] Task run history logging (task_runs table)
- [x] Natural language → cron translation (Claude does this in MCP tool description)
- [x] Results saved to ~/Daymon/results/ as timestamped markdown
- [x] Test: schedule a task via Claude, verify it runs on time

### Week 4: Desktop UI — DONE
- [x] StatusPanel — memory count, active tasks, last run, scheduler status
- [x] MemoryPanel — list all memories, search bar, expand/delete
- [x] TasksPanel — list tasks, toggle active/paused, run now, delete
- [x] ResultsPanel — list past runs, click to expand output
- [x] SettingsPanel — connection status, paths, version, quit
- [x] TabBar + tab-based navigation in App.tsx
- [x] usePolling hook for auto-refresh

### Week 5: System Integration + Polish — DONE
- [x] Auto-launch at login (Electron setLoginItemSettings)
- [x] Scheduler persistence (runs in Electron main process)
- [x] macOS notifications on task completion (Electron Notification API)
- [x] File watcher implementation (chokidar + daymon_watch/unwatch/list_watches MCP tools)
- [x] Error handling: Claude CLI detection, ENOENT-specific messages, checkClaudeCliAvailable()
- [x] Graceful config patching (already solid from Week 2)
- [x] Uninstall flow (remove from Claude config + delete app data)

### Phase 1.5: Smart Scheduling + Progress — DONE
- [x] DB migration V2: scheduled_at column on tasks, progress/progress_message on task_runs
- [x] One-time task support (trigger_type='once', scheduler checks due tasks every 30s)
- [x] On-demand/manual tasks (trigger_type='manual', daymon_run_task MCP tool)
- [x] Task progress tracking (stream-json executor + progress DB columns)
- [x] Self-contained prompt guidance in daymon_schedule tool description
- [x] Auto-naming tasks (name parameter optional, generateTaskName helper)
- [x] daymon_task_progress MCP tool
- [x] daymon_run_task MCP tool
- [x] UI: progress bar, one-time task display, "Run Now" button, completed status badge
- [x] Test suite: 89 tests across 4 files (vitest)

### Phase 1.6: Claude Code MCP Integration — DONE
- [x] Move executor to shared module (`src/shared/claude-code.ts`)
- [x] Create shared task runner (`src/shared/task-runner.ts`) with dependency injection
- [x] `daymon_run_task` executes directly in MCP server (no Electron needed)
- [x] Works from both Claude Code (`.mcp.json`) and Claude Desktop (`claude_desktop_config.json`)
- [x] Task source tracking: `triggerConfig` stores origin (claude-code / claude-desktop / daymon)
- [x] `DAYMON_SOURCE` env var distinguishes Claude Code vs Claude Desktop
- [x] Source displayed in TasksPanel UI ("via Claude Code" / "via Claude Desktop" / "via Daymon")
- [x] StatusPanel: Memory, Tasks, Last Run cards clickable → navigate to tab
- [x] `.mcp.json` in project root for Claude Code connection
- [x] Auto-approve Daymon MCP tools in global Claude Code settings
- [x] `--verbose` flag fix for `stream-json` output format
- [x] CLAUDE.md updated with Control Modes docs
- [x] Test suite: 115 tests across 6 files (task-runner + source-tracking tests added)

### Phase 1.7: Max Runs — DONE
- [x] DB migration V3: `max_runs` and `run_count` columns on tasks
- [x] `maxRuns` param on `daymon_schedule` MCP tool (optional, omit for unlimited)
- [x] Task auto-completes after N successful runs (failed runs don't count)
- [x] `runCount` incremented on each successful execution in shared task-runner
- [x] `daymon_list_tasks` includes `maxRuns` and `runCount` in output
- [x] TasksPanel UI shows "X / Y runs" when maxRuns is set
- [x] Test suite: 125 tests across 6 files (maxRuns db + task-runner tests added)

### Phase 1.8: Memory-Aware Task Execution — DONE
- [x] DB migration V4: `memory_entity_id` FK column on tasks → entities
- [x] Memory context injection: before each run, inject last 5 observations into prompt
- [x] Cross-task memory: searches ALL memory (user memories + other task results) via FTS word splitting
- [x] Result storage: after each run, stores output as observation on task's memory entity
- [x] Auto-pruning: keeps max 10 observations per task entity (prevents unbounded growth)
- [x] Result truncation: caps stored results at 2000 chars
- [x] Non-fatal memory: memory errors never block task execution (try/catch wrapped)
- [x] `daymon_recall` surfaces task results in any conversation (cross-conversation knowledge sharing)
- [x] `incrementRunCount()` replaces inline runCount logic
- [x] Test suite: 149 tests across 6 files (34 new memory-task + incrementRunCount tests)

### Phase 2: Workers, Session Continuity, Semantic Memory — DONE
- [x] DB migration V5: workers table, task.worker_id/session_continuity/session_id, task_runs.session_id, embeddings table, entities.embedded_at
- [x] Workers: named agent configs with system prompts, CRUD (create/list/update/delete/getDefault)
- [x] Worker resolution: task's workerId > default worker > none → passed via `--system-prompt` to Claude CLI
- [x] MCP tools: daymon_create_worker, daymon_list_workers, daymon_update_worker, daymon_delete_worker
- [x] Session continuity: tasks can resume Claude CLI sessions across runs via `--resume <session-id>`
- [x] Session rotation: fresh session after 20 consecutive runs (prevents context overflow)
- [x] Session error recovery: retry without session on resume failure, clear stale session
- [x] Session-aware memory: cross-task only for subsequent session runs (session has own history)
- [x] MCP tools: daymon_schedule updated with workerId/sessionContinuity params, daymon_reset_session added
- [x] Semantic memory: @huggingface/transformers with Xenova/all-MiniLM-L6-v2 (384 dims, local embeddings)
- [x] Hybrid search: FTS5 + vector cosine similarity with reciprocal rank fusion in daymon_recall
- [x] Background embedding indexer: runs every 5 minutes in Electron scheduler
- [x] Non-fatal embeddings: all operations wrapped in try/catch, FTS fallback when engine unavailable
- [x] WorkersPanel UI: create/edit/delete workers, system prompt textarea, default badge
- [x] TasksPanel: worker name and "continuous" badge shown on tasks
- [x] Workers tab added to TabBar between Memory and Tasks
- [x] Build config: @huggingface/transformers dependency, onnxruntime-node externals/asarUnpack
- [x] Test suite: 225 tests across 8 files (workers, sessions, embeddings, hybrid search, claude-code executor, generateTaskName)

### Week 6: Package + Launch
- [x] electron-builder: create signed + notarized DMG
- [x] Homebrew cask formula
- [x] Auto-update via electron-updater (check/download/install UI in Settings)
- [x] Landing page: daymon.io
- [x] GitHub README with install instructions, tools reference, workers, session continuity
- [x] MIT LICENSE file
- [x] GitHub Actions build + release workflow (.github/workflows/build.yml)
- [ ] Record 2-min demo video
- [ ] Launch posts (HN, r/ClaudeAI, Product Hunt, Twitter/X)

---

## ~~Phase 2: ChatGPT Integration~~ — Removed
ChatGPT Desktop does not support local MCP servers. It requires Developer Mode (paid plans only), a public HTTPS URL via ngrok tunnel (no localhost), and per-chat manual enablement of each connector. This makes ChatGPT integration impractical for a local desktop app. Daymon focuses exclusively on Claude, which has native local MCP support via a config file — zero friction, auto-configured.

---

## ~~Phase 3: Windows~~ — Removed
Mac-only for now. Will revisit if there's demand.
