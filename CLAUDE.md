# Claude Instructions for Daymon

Open source autopilot for Claude and ChatGPT — daymon.io

Electron desktop app: scheduled tasks, persistent memory, background automation.

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
2. **Run tests** - Run `npm test` (if tests exist)
3. **Git status** - Check what files changed
4. **Git commit** - Create a meaningful commit message
5. **Git push** - Push to origin main

### "cd" - Commit, Push, and Build (FULL)

For the final agent or when work is complete. Full commit + build.

1. **TypeScript check** - Run `npx tsc --noEmit` to catch type errors
2. **Run tests** - Run `npm test` (if tests exist)
3. **Git status** - Check what files changed
4. **Git commit** - Create a meaningful commit message
5. **Git push** - Push to origin main
6. **Build** - Run `npm run build` and WAIT for build to complete:
   - If build succeeds: Done
   - If build fails: Read error from output, fix the issue, and repeat from step 3

**CRITICAL**: Do NOT tell user "done" until build succeeds.

### Team Mode (Parallel Agents)

When multiple agents work in parallel on different tasks:
- **Sub-agents**: Use `c` to commit their work (no build)
- **Orchestrator/Final agent**: Use `cd` to build after all agents complete
- This prevents building incomplete code or triggering multiple builds

## Git Setup

- Remote: `https://github.com/daymonio/daymon.git`
- Push with: `git push origin main`
- **ALWAYS check TypeScript before committing**: Run `npx tsc --noEmit` before pushing.

## Tech Stack

- **Desktop**: Electron (menu bar / tray app)
- **UI**: React + Tailwind CSS
- **MCP Server**: TypeScript (MCP SDK) — stdio + HTTP/SSE transports
- **Database**: better-sqlite3 (local, zero config)
- **Scheduler**: node-cron
- **File Watcher**: chokidar
- **Task Executor**: child_process → Claude Code CLI
- **Packaging**: electron-builder (DMG for Mac, NSIS for Windows)
- **Auto-update**: electron-updater (GitHub Releases)

## Project Structure

```
daymon/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, tray setup, window management
│   │   ├── tray.ts              # Menu bar icon + popover
│   │   ├── mcp/                 # MCP server
│   │   │   ├── server.ts
│   │   │   ├── stdio.ts         # stdio transport (Claude Desktop)
│   │   │   ├── http.ts          # HTTP/SSE transport (ChatGPT)
│   │   │   └── tools/           # MCP tools (memory, scheduler, watcher, status)
│   │   ├── scheduler/           # Task scheduling engine
│   │   ├── executor/            # AI task execution (Claude Code CLI)
│   │   └── db/                  # SQLite database layer
│   ├── renderer/                # React UI
│   │   ├── App.tsx
│   │   ├── panels/              # StatusPanel, MemoryPanel, TasksPanel, etc.
│   │   ├── components/
│   │   ├── hooks/
│   │   └── styles/
│   └── shared/                  # Shared types and constants
├── scripts/                     # Setup scripts
├── resources/                   # App icons, tray icons
├── electron-builder.yml
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

## Development Workflow

### Server Commands

```bash
# Development
npm run dev               # Start Electron in dev mode

# Build
npm run build             # Full build (main + renderer)

# Package
npm run package           # Create distributable (DMG/EXE)
```

### Testing Requirements

**CRITICAL: Every feature MUST be tested before telling user it's done.**

- Run `npx tsc --noEmit` after any TypeScript changes
- Run `npm test` before committing
- Test Electron IPC interactions manually when modifying main↔renderer communication
- Test MCP tools by connecting to Claude Desktop and verifying tool responses

## Landing Page (daymon.io)

- Hosted on **GitHub Pages** from this repo
- Deploy: push to `main`, served from `docs/` folder or `gh-pages` branch
- Custom domain: daymon.io

## License

- **AGPL-3.0** — all source must remain open, including server-side forks

### Do NOT Tell User "Done" Until:
- TypeScript compiles without errors
- Tests pass (if they exist)
- Feature works in the running Electron app (verified)

## Progress Tracking

- A shared progress file exists at `PROGRESS.md` in the project root.
- **Every agent MUST** update `PROGRESS.md` when completing a task — change `[ ]` to `[x]`.
- Before starting work, check `PROGRESS.md` to see what's already done.
- Do NOT remove or reorder items. Only mark them complete.
