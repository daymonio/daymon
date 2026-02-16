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

## Worker Role Field

- [x] Add DB migration V13 + schema: add role column (@executor)
- [x] Update types + validation: add role to Worker interface and Zod schemas (@executor)
- [x] Update DB queries: createWorker, mapWorkerRow, updateWorker (@executor)
- [x] Update MCP tools: workers.ts and scheduler.ts (@executor)
- [x] Update UI: WorkersPanel create/edit forms + card display (@executor)
- [x] Write tests: 4 new role field tests (@executor)
- [x] Typecheck + test (402 passing) + full build (@executor)
- [x] Update CLAUDE.md documentation (schema V13, worker descriptions) (@executor)

## Worker Templates: Add Names + Roles

- [x] Update WORKER_TEMPLATES with personal names and role fields (@executor)
- [x] Update useTemplate() to populate role from template (@executor)
- [x] Typecheck + test (@executor)

## Test Coverage for Worker Role

- [x] Add MCP tool-responses tests for role in create/update/list workers (@executor)
- [x] Add db-queries tests for clearing and changing role (@executor)
- [x] Typecheck + test — 408 passing (@executor)
