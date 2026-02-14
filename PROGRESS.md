# Daymon Progress Tracker

All agents MUST update this file when completing a task. Change `[ ]` to `[x]`.

---

## Phase 1: Mac + Claude

### Week 1: Foundation
- [ ] Init Electron + React + Tailwind project
- [ ] Menu bar tray app shell (click icon → popover window)
- [ ] SQLite database setup with full schema
- [ ] Database CRUD layer (memory.ts, tasks.ts)
- [ ] Config module with macOS paths
- [ ] Basic IPC bridge (main ↔ renderer)

### Week 2: MCP Server + Memory
- [ ] MCP server with stdio transport
- [ ] Memory tools: daymon_remember, daymon_recall, daymon_forget, daymon_memory_list
- [ ] Auto-patch Claude Desktop config on first launch
- [ ] Test: talk to Claude, store/retrieve memories
- [ ] Memory search (basic keyword matching on SQLite FTS5)

### Week 3: Scheduler + Task Execution
- [ ] Scheduler tools: daymon_schedule, daymon_list_tasks, daymon_pause_task, daymon_delete_task
- [ ] node-cron engine in main process
- [ ] Claude Code CLI executor (spawn `claude -p "prompt"`)
- [ ] Task run history logging (task_runs table)
- [ ] Natural language → cron translation
- [ ] Results saved to ~/Daymon/results/ as timestamped markdown
- [ ] Test: schedule a task via Claude, verify it runs on time

### Week 4: Desktop UI
- [ ] StatusPanel — memory count, active tasks, last run, next run
- [ ] MemoryPanel — list all memories, search bar, edit/delete
- [ ] TasksPanel — list tasks, toggle active/paused, view schedule
- [ ] CronPicker — visual schedule builder
- [ ] ResultsPanel — list past runs, click to view output
- [ ] SettingsPanel — connection status, executor choice, paths

### Week 5: System Integration + Polish
- [ ] Auto-launch at login
- [ ] Scheduler persistence (launchd or Electron main process)
- [ ] macOS notifications on task completion
- [ ] File watcher implementation (daymon_watch, daymon_unwatch)
- [ ] Error handling: Claude Code not found, CLI errors, timeouts
- [ ] Graceful config patching
- [ ] Uninstall flow

### Week 6: Package + Launch
- [ ] electron-builder: create signed + notarized DMG
- [ ] Homebrew cask formula
- [x] Landing page: daymon.io
- [ ] GitHub README with screenshots, install instructions, demo
- [ ] Record 2-min demo video
- [ ] Launch posts (HN, r/ClaudeAI, Product Hunt, Twitter/X)

---

## Phase 2: ChatGPT Integration
- [ ] HTTP/SSE transport alongside stdio
- [ ] Test with ChatGPT Desktop Developer Mode connector
- [ ] Onboarding flow: "Connect Claude" + "Connect ChatGPT"
- [ ] Memory tagged with source (claude/chatgpt)
- [ ] Update landing page and README
- [ ] Blog post: "Daymon now works with ChatGPT"

---

## Phase 3: Windows
- [ ] Windows file paths and platform adaptation
- [ ] System tray + Toast notifications
- [ ] Auto-start via Task Scheduler / Registry
- [ ] electron-builder: NSIS installer (.exe)
- [ ] Windows code signing
- [ ] winget package manifest
- [ ] Test on Windows 10 + 11
- [ ] Update landing page: "Now available for Windows"
