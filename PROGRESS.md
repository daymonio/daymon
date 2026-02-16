# Daymon Progress

<!--
  Agents: Before starting work, add your planned tasks below with your agent name.
  Format: - [ ] Task description (@agent-name)
  Mark [x] as you complete each task.
-->

## Sidecar Architecture (Fix spawn EBADF)

- [x] Phase 1: Sidecar skeleton + launch (server.ts, events.ts, main/sidecar.ts, build)
- [x] Phase 2: Task execution via sidecar (POST /tasks/:id/run, SSE, ipc.ts)
- [x] Phase 3: Cron scheduler in sidecar (scheduler.ts, POST /sync)
- [x] Phase 4: File watchers + embeddings in sidecar
- [x] Phase 5: Cleanup, tests, CLAUDE.md update

## Task Filters UI

- [x] Add filter types, FilterPill, FilterBar, filterTasks to TasksPanel.tsx (@main)
- [x] Pass advancedMode prop from App.tsx to TasksPanel (@main)
- [x] TypeScript check and test run (@main)
