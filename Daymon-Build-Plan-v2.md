# Daymon — Build Plan v2
## Electron + Phased Rollout
## daymon.io | daymon.app

---

## PHASED ROLLOUT

### Phase 1: Mac + Claude (Weeks 1-6) → LAUNCH
### Phase 2: ChatGPT integration (Weeks 7-9)
### Phase 3: Windows (Weeks 10-12)

---

## TECH STACK

| Component | Technology | Why |
|-----------|-----------|-----|
| Desktop app | Electron | Rich UI future-proofing, React ecosystem, easy hiring |
| UI framework | React + Tailwind | Fast to build, huge component ecosystem |
| MCP server | TypeScript (MCP SDK) | MCP SDK is TypeScript-first |
| Database | better-sqlite3 | Zero config, single file, fast, works in Electron |
| Scheduler | node-cron | Battle-tested, runs in Electron main process |
| File watcher | chokidar | Standard Node.js file watching |
| Task executor | child_process → claude CLI | Spawns Claude Code CLI headless |
| Notifications | Electron Notification API | Native OS notifications |
| Auto-start | electron-auto-launch | Cross-platform login item |
| Packaging | electron-builder | DMG for Mac, NSIS for Windows |
| Auto-update | electron-updater | GitHub Releases as update source |

### Keeping Electron Lean
- Start as menu bar / tray app (electron-tray-window)
- No visible dock icon by default (app.dock.hide() on Mac)
- Single window, lazy-loaded panels
- Target: <80MB installed, <50MB RAM idle
- No unnecessary Chrome features (disable GPU when hidden, etc.)

---

## ARCHITECTURE

```
┌──────────────────────────────────────────────────────────┐
│                    ELECTRON APP                           │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Main Process (Node.js)                             │ │
│  │                                                     │ │
│  │  ┌──────────┐ ┌───────────┐ ┌───────────────────┐  │ │
│  │  │ MCP      │ │ Scheduler │ │ Task Executor     │  │ │
│  │  │ Server   │ │           │ │                   │  │ │
│  │  │          │ │ • cron    │ │ • Claude Code CLI │  │ │
│  │  │ • stdio  │ │ • file    │ │ • API fallback    │  │ │
│  │  │ • HTTP   │ │   watch   │ │                   │  │ │
│  │  │          │ │ • triggers│ │                   │  │ │
│  │  └────┬─────┘ └─────┬─────┘ └─────────┬─────────┘  │ │
│  │       │              │                 │            │ │
│  │  ┌────┴──────────────┴─────────────────┴─────────┐  │ │
│  │  │              SQLite Database                   │  │ │
│  │  │  memories | tasks | task_runs | watches        │  │ │
│  │  └───────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Renderer Process (React + Tailwind)                │ │
│  │                                                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │ │
│  │  │ Status   │ │ Memory   │ │ Task     │            │ │
│  │  │ Panel    │ │ Browser  │ │ Manager  │            │ │
│  │  └──────────┘ └──────────┘ └──────────┘            │ │
│  │  ┌──────────┐ ┌──────────┐                          │ │
│  │  │ Results  │ │ Settings │                          │ │
│  │  │ Viewer   │ │ Panel    │                          │ │
│  │  └──────────┘ └──────────┘                          │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
         │
         │ MCP Protocol
         │
    Phase 1: stdio → Claude Desktop
    Phase 2: HTTP/SSE → ChatGPT Desktop
```

---

## PROJECT STRUCTURE

```
github.com/nicknyr/daymon
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, tray setup, window management
│   │   ├── tray.ts              # Menu bar icon + popover
│   │   ├── autolaunch.ts        # Login item registration
│   │   ├── updater.ts           # Auto-update from GitHub Releases
│   │   │
│   │   ├── mcp/                 # MCP server
│   │   │   ├── server.ts        # MCP server setup + tool registration
│   │   │   ├── stdio.ts         # stdio transport (Claude Desktop)
│   │   │   ├── http.ts          # HTTP/SSE transport (ChatGPT) [Phase 2]
│   │   │   └── tools/
│   │   │       ├── memory.ts    # remember, recall, forget, list
│   │   │       ├── scheduler.ts # schedule, list, pause, delete
│   │   │       ├── watcher.ts   # watch, unwatch
│   │   │       └── status.ts    # status, results
│   │   │
│   │   ├── scheduler/           # Task scheduling engine
│   │   │   ├── cron.ts          # node-cron wrapper
│   │   │   ├── filewatcher.ts   # chokidar wrapper
│   │   │   └── runner.ts        # Task execution loop
│   │   │
│   │   ├── executor/            # AI task execution
│   │   │   ├── index.ts         # Executor interface
│   │   │   ├── claude-code.ts   # Claude Code CLI spawner
│   │   │   └── api.ts           # Direct API fallback [optional]
│   │   │
│   │   ├── db/                  # Database layer
│   │   │   ├── index.ts         # SQLite connection + migrations
│   │   │   ├── memory.ts        # Memory CRUD operations
│   │   │   ├── tasks.ts         # Task CRUD operations
│   │   │   └── schema.sql       # Table definitions
│   │   │
│   │   ├── notifications.ts     # OS notification wrapper
│   │   └── config.ts            # Paths, defaults, platform detection
│   │
│   ├── renderer/                # React UI
│   │   ├── App.tsx              # Root component + routing
│   │   ├── panels/
│   │   │   ├── StatusPanel.tsx   # Overview: memories, tasks, last run
│   │   │   ├── MemoryPanel.tsx   # Browse, search, edit, delete memories
│   │   │   ├── TasksPanel.tsx    # Create, edit, toggle, view tasks
│   │   │   ├── ResultsPanel.tsx  # View task outputs (markdown)
│   │   │   └── SettingsPanel.tsx # Connections, executor, preferences
│   │   ├── components/
│   │   │   ├── MemoryCard.tsx
│   │   │   ├── TaskRow.tsx
│   │   │   ├── CronPicker.tsx   # Visual cron builder (no cron syntax)
│   │   │   ├── ConnectionStatus.tsx
│   │   │   └── ResultViewer.tsx  # Markdown renderer
│   │   ├── hooks/
│   │   │   ├── useIPC.ts        # Electron IPC bridge
│   │   │   ├── useMemory.ts     
│   │   │   └── useTasks.ts
│   │   └── styles/
│   │       └── globals.css      # Tailwind base
│   │
│   └── shared/                  # Shared types
│       ├── types.ts             # Memory, Task, TaskRun, Watch types
│       └── constants.ts         # Tool names, defaults
│
├── scripts/
│   ├── setup-claude.ts          # Auto-patch Claude Desktop MCP config
│   ├── setup-chatgpt.ts         # ChatGPT connector guide [Phase 2]
│   └── postinstall.ts           # First-launch setup
│
├── resources/                   # App icons, tray icons
│   ├── icon.png
│   ├── trayIconTemplate.png     # macOS menu bar (Template for dark/light)
│   └── trayIcon.ico             # Windows system tray
│
├── electron-builder.yml         # Build config (DMG, NSIS)
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── README.md
├── LICENSE                      # AGPL-3.0
└── CHANGELOG.md
```

---

## PHASE 1: Mac + Claude (Weeks 1-6)

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
  - Read existing config → backup → merge Daymon server → save
- [ ] Test: talk to Claude, store/retrieve memories
- [ ] Memory search (basic keyword matching on SQLite FTS5)

### Week 3: Scheduler + Task Execution
- [ ] Scheduler tools: daymon_schedule, daymon_list_tasks, daymon_pause_task, daymon_delete_task
- [ ] node-cron engine in main process
- [ ] Claude Code CLI executor (spawn `claude -p "prompt"`)
- [ ] Task run history logging (task_runs table)
- [ ] Natural language → cron translation (let Claude do this in the MCP tool)
- [ ] Results saved to ~/Daymon/results/ as timestamped markdown
- [ ] Test: schedule a task via Claude, verify it runs on time

### Week 4: Desktop UI
- [ ] StatusPanel — memory count, active tasks, last run, next run
- [ ] MemoryPanel — list all memories, search bar, edit/delete
- [ ] TasksPanel — list tasks, toggle active/paused, view schedule
- [ ] CronPicker — visual schedule builder (dropdowns, not cron syntax)
- [ ] ResultsPanel — list past runs, click to view output (markdown)
- [ ] SettingsPanel — connection status, executor choice, paths

### Week 5: System Integration + Polish
- [ ] Auto-launch at login (electron-auto-launch)
- [ ] launchd daemon for scheduler (survives app quit)
  OR: keep scheduler in Electron main process + ensure app persists
- [ ] macOS notifications on task completion
- [ ] File watcher implementation (daymon_watch, daymon_unwatch)
- [ ] Error handling: Claude Code not found, CLI errors, timeouts
- [ ] Graceful config patching (don't break existing MCP servers)
- [ ] Uninstall flow: revert config, remove daemon, optionally delete data

### Week 6: Package + Launch
- [ ] electron-builder: create signed + notarized DMG
- [ ] Homebrew cask formula
- [ ] Landing page: daymon.io (simple, GitHub link, download button, demo GIF)
- [ ] GitHub README with screenshots, install instructions, demo
- [ ] Record 2-min demo video
- [ ] Write launch posts for:
  - [ ] Hacker News ("Show HN: Daymon — open source autopilot for Claude")
  - [ ] r/ClaudeAI
  - [ ] Product Hunt
  - [ ] Twitter/X thread
- [ ] LAUNCH 🚀

### Phase 1 Deliverables
- macOS menu bar app (.dmg + Homebrew)
- Works with Claude Desktop only
- Memory (store/recall/edit via Claude)
- Scheduled tasks (create via Claude, run via Claude Code CLI)
- File watchers
- Visual task/memory manager UI
- Open source (MIT) on GitHub

---

## PHASE 2: ChatGPT Integration (Weeks 7-9)

### Week 7: HTTP/SSE Transport
- [ ] Add HTTP/SSE server alongside existing stdio server
- [ ] Same tools, different transport — no logic changes
- [ ] Test with ChatGPT Desktop Developer Mode connector
- [ ] Document: how to add Daymon connector in ChatGPT settings

### Week 8: Onboarding + Cross-Platform Memory
- [ ] Update first-launch flow: "Connect Claude" + "Connect ChatGPT"
- [ ] ChatGPT connection wizard (walk user through Settings → Connectors)
- [ ] Memory now tagged with source: "claude" or "chatgpt"
- [ ] Both AIs read from same memory store
- [ ] Test: remember something in Claude, recall it in ChatGPT

### Week 9: Polish + Announce
- [ ] Update landing page and README
- [ ] Update demo video showing both AIs
- [ ] Blog post: "Daymon now works with ChatGPT"
- [ ] Post to r/ChatGPT, OpenAI community forums

### Phase 2 Deliverables
- ChatGPT Desktop support via HTTP/SSE
- Shared memory across Claude + ChatGPT
- Updated onboarding for dual AI setup

---

## PHASE 3: Windows (Weeks 10-12)

### Week 10: Platform Adaptation
- [ ] Windows file paths (%APPDATA%, %LOCALAPPDATA%)
- [ ] System tray instead of menu bar (same Electron tray API)
- [ ] Windows Toast notifications (same Electron API)
- [ ] Task Scheduler or Registry Run key for auto-start
- [ ] Claude Desktop Windows config path
- [ ] ChatGPT Desktop Windows config path
- [ ] Test Claude Code CLI on Windows

### Week 11: Packaging + Testing
- [ ] electron-builder: NSIS installer (.exe)
- [ ] Windows code signing certificate
- [ ] winget package manifest
- [ ] Test full flow on Windows 10 + Windows 11
- [ ] Fix any path separator issues (\ vs /)
- [ ] Test auto-update on Windows

### Week 12: Launch Windows
- [ ] Update landing page: "Now available for Windows"
- [ ] Add Windows install instructions to README
- [ ] Windows-specific screenshots
- [ ] Announce on r/ClaudeAI, r/ChatGPT, Twitter/X, HN
- [ ] Submit to winget community repo

### Phase 3 Deliverables
- Windows installer (.exe + winget)
- Full feature parity with Mac
- Both Claude + ChatGPT on Windows

---

## MCP TOOLS REFERENCE

### Memory
| Tool | Description | Example |
|------|-------------|---------|
| `daymon_remember` | Store a fact | "Remember I'm fundraising Series A" |
| `daymon_recall` | Search memories | "What do you know about my projects?" |
| `daymon_forget` | Delete a memory | "Forget my old phone number" |
| `daymon_memory_list` | List all memories | "Show everything Daymon remembers" |

### Scheduler  
| Tool | Description | Example |
|------|-------------|---------|
| `daymon_schedule` | Create recurring task | "Every weekday 9am, check HN top stories" |
| `daymon_list_tasks` | Show all tasks | "What's Daymon running?" |
| `daymon_pause_task` | Pause a task | "Pause the morning briefing" |
| `daymon_resume_task` | Resume a task | "Turn the briefing back on" |
| `daymon_delete_task` | Delete a task | "Cancel the weekly report" |
| `daymon_task_history` | Show past runs | "How did last night's task go?" |

### File Watching
| Tool | Description | Example |
|------|-------------|---------|
| `daymon_watch` | Watch folder for changes | "Watch Downloads, organize new PDFs" |
| `daymon_unwatch` | Stop watching | "Stop watching Downloads" |

### Utility
| Tool | Description | Example |
|------|-------------|---------|
| `daymon_status` | Daymon overview | "Is Daymon running?" |
| `daymon_results` | Last task output | "Show me this morning's results" |

---

## DATABASE SCHEMA

```sql
-- Memories
CREATE TABLE entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'fact',
    category TEXT,  -- work, personal, preference, project, person
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'claude',  -- claude, chatgpt, manual
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_entity INTEGER REFERENCES entities(id) ON DELETE CASCADE,
    to_entity INTEGER REFERENCES entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Full text search on memories
CREATE VIRTUAL TABLE memory_fts USING fts5(
    name, content, category,
    content='entities',
    content_rowid='id'
);

-- Scheduled tasks
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    cron_expression TEXT,
    trigger_type TEXT DEFAULT 'cron',  -- cron, file_watch, manual
    trigger_config TEXT,               -- JSON
    executor TEXT DEFAULT 'claude_code',
    status TEXT DEFAULT 'active',
    last_run DATETIME,
    last_result TEXT,
    error_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task run history
CREATE TABLE task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    status TEXT DEFAULT 'running',
    result TEXT,
    result_file TEXT,  -- path to saved result markdown
    error_message TEXT,
    duration_ms INTEGER
);

-- File watches
CREATE TABLE watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    description TEXT,
    action_prompt TEXT,
    status TEXT DEFAULT 'active',
    last_triggered DATETIME,
    trigger_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- App settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## LANDING PAGE (daymon.io)

```
[Logo: Daymon]

Your Claude subscription only works when you do.
Daymon puts it to work 24/7.

Open source autopilot for Claude and ChatGPT.
Scheduled tasks, persistent memory, background automation.
No API keys. No cloud. Runs on your Mac.

[Download for Mac]  [View on GitHub]

        [Demo GIF: scheduling a task via Claude, 
         then seeing the result next morning]

--- 

How it works

1. Install Daymon → menu bar icon appears
2. Claude/ChatGPT gain new superpowers via MCP
3. Schedule tasks: "Every morning, summarize my inbox"  
4. Your subscription works while you sleep.

---

Features

⏰ Scheduled Tasks
  "Every weekday at 9am, check HackerNews for AI news"
  Create tasks by talking to Claude. Daymon runs them on time.

🧠 Shared Memory  
  Claude and ChatGPT share one brain. 
  Remember something in Claude, recall it in ChatGPT.

📁 File Watchers
  "When a new file appears in Downloads, organize it"
  Daymon watches folders and acts automatically.

🔒 100% Local
  Everything on your Mac. No cloud. No account.
  Your data is a SQLite file you can inspect anytime.

---

[Download for Mac]  [View on GitHub]  [Star on GitHub ⭐]
```

---

## KEY DECISIONS LOG

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Framework | Electron | Future UI needs, React ecosystem, easier hiring |
| Phase 1 scope | Mac + Claude only | Fastest path to launch, power users skew Mac |
| Phase 2 | Add ChatGPT | Shared memory is a differentiator |
| Phase 3 | Windows | 70% of market, but launch Mac-first |
| License | AGPL-3.0 | Protects open source, prevents closed-source forks |
| Task executor | Claude Code CLI (primary) | No API key needed, uses existing subscription |
| API key fallback | Optional in settings | For users without Claude Code |
| Database | SQLite | Zero config, inspectable, portable |
| Memory model | Knowledge graph (entities + observations) | Same as Anthropic's MCP memory server |
| Scheduling UI | Visual dropdowns in app | Users never see cron syntax |
| Scheduling via chat | Claude translates natural language → cron | "Every weekday at 9" → "0 9 * * 1-5" |
| Auto-start | electron-auto-launch | Cross-platform, well-maintained |
| Updates | electron-updater + GitHub Releases | Free, open source friendly |
| Landing page | Simple static page on daymon.io | GitHub Pages or Cloudflare Pages |
