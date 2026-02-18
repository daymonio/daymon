# OpenClaw Feature Analysis

Research summary for reuse across docs, blog posts, and comparisons.
Last updated: 2026-02-14 | Source: github.com/openclaw/openclaw

---

## Overview

OpenClaw (formerly Clawdbot/Moltbot) is a Node.js/TypeScript AI agent gateway by Peter Steinberger. 100k+ GitHub stars. Architecturally very different from Daymon — it's a **messaging-first AI agent gateway**, not a desktop menu bar app. Users interact primarily via chat platforms (Telegram, WhatsApp, Discord, Slack, etc.).

---

## 1. Workers / Agent System

**OpenClaw: Rich, deeply layered agent identity system.**

- **SOUL.md** — centerpiece of agent personality. Markdown file at `~/.openclaw/workspace/SOUL.md` injected into system prompt every turn. Defines personality traits, values, communication style. Built-in `soulcraft` skill generates SOUL.md via interview. Experimental "Soul Evolution" lets agent mutate its own SOUL.md.
- **Bootstrap files** injected every turn: `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`, `MEMORY.md`. All truncated at 20K chars.
- **Agent config** includes: model (primary + fallback), workspace, skills, memory search config, human delay, heartbeat, identity (name, prefix, ack emoji), group chat behavior, sub-agent config, Docker sandbox, tool policy.
- **System prompt** generated programmatically with 15+ sections. Three `promptMode` variants: full, minimal (sub-agents), none.
- **Multi-agent**: named agents with per-agent configs, sub-agent spawning (`sessions_spawn`), inter-agent messaging (`sessions_send`).

**Daymon: Simple worker system with system prompts.**

- Workers are named configs with a system prompt, description, and optional model.
- Worker resolution: task's workerId > default worker > none.
- System prompt passed via Claude CLI's `--system-prompt` flag.
- No multi-agent routing, sub-agent spawning, or inter-agent messaging.
- Templates for quick creation (Researcher, Code Reviewer, Writer, Data Analyst, DevOps).

**Key difference**: OpenClaw agents are autonomous entities with identity, personality evolution, and multi-agent coordination. Daymon workers are prompt templates assigned to tasks.

---

## 2. Session Continuity

**OpenClaw: Full session management for chat, isolated sessions for cron.**

- Sessions keyed per sender/channel/agent.
- Normal conversations: full session continuity. Users can `/new`, `/reset`, `/compact`.
- **Cron jobs: NO continuity** — each cron execution gets a fresh `cron:<jobId>` session. This is by design.
- Session history accessible via `sessions_history` tool. Transcripts stored as JSONL files.
- Session transcripts indexed by memory system for cross-session recall.

**Daymon: Optional session continuity via Claude CLI's `--resume`.**

- Tasks can opt into `sessionContinuity: true`.
- When enabled, Claude CLI sessions persist across runs via `--resume <session-id>`.
- Session rotation after 20 consecutive runs (prevents context overflow).
- Error recovery: retry without session on resume failure, clear stale session.
- Session-aware memory injection: first run gets full context, subsequent runs get cross-task knowledge only (session has own history).
- `daymon_reset_session` tool for manual session reset.

**Key difference**: Daymon offers opt-in session continuity for scheduled tasks — OpenClaw deliberately doesn't. OpenClaw compensates with rich memory indexing.

---

## 3. Memory System

**OpenClaw: Sophisticated semantic memory with embeddings.**

- **Storage**: SQLite — `chunks` (text + embeddings), `chunks_fts` (FTS5/BM25), `embedding_cache`, `files`, `meta`.
- **Embedding providers**: OpenAI, Gemini, Voyage, local (`node-llama-cpp` with `embeddinggemma-300m-qat-Q8_0.gguf`). Auto mode: tries local first, then remote.
- **Vector search**: `sqlite-vec` extension for native SQLite vector ops.
- **Hybrid search**: vector similarity + FTS keyword matching, weighted linear combination. BM25 normalized via `1/(1+rank)`.
- **Memory manager**: search, sync (incremental re-indexing), file reading, status, embedding caching.
- **What it stores**: Markdown files (`MEMORY.md`, `memory/*.md`) + session transcripts (JSONL). Agent reads, user writes. System indexes and searches.
- **Tools**: `memory_search` (semantic), `memory_get` (retrieve lines). No `memory_write` — memory is user-edited markdown.
- **Alternative backend**: `qmd` with own search modes.

**Daymon: Entity/observation storage with hybrid FTS + vector search.**

- **Storage**: SQLite — `entities` (name, type, category), `observations` (content on entities), `entities_fts` (FTS5), `embeddings` (vectors).
- **Embedding**: `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2` (384 dims, local-only, ~12MB).
- **Hybrid search**: FTS5 + cosine similarity, reciprocal rank fusion (FTS 0.4 + semantic 0.6).
- **Background indexer**: every 5 minutes, processes unembedded entities.
- **Non-fatal**: all embedding operations try/catch wrapped. FTS fallback when embeddings unavailable.
- **Tools**: `daymon_remember` (store), `daymon_recall` (hybrid search), `daymon_forget` (delete), `daymon_memory_list` (list).
- **Task memory integration**: tasks linked to memory entities, auto-inject context before runs, store results after runs, cross-task knowledge sharing.

**Key difference**: OpenClaw has more embedding providers and uses sqlite-vec for vector ops. Daymon does pure JS cosine similarity (sufficient at <10K entities scale) and has tighter task-memory integration where tasks automatically build knowledge over time.

---

## 4. Task Scheduling

**OpenClaw:**

- **Types**: `at` (one-shot, ISO 8601), `every` (recurring ms intervals), `cron` (5-field + timezone via `croner`).
- **Execution**: main session jobs (heartbeat context) or isolated jobs (fresh `cron:<jobId>` sessions).
- **Heartbeat system**: periodic timer wakes agent, agent decides what to do.
- **Delivery**: `none` (internal) or `announce` (delivers to chat channels).
- **Storage**: JSON file (`jobs.json`), run logs as JSONL (auto-prunes at 2MB/2000 lines).
- **Reliability**: exponential backoff (30s → 60m). One-shot jobs disable on failure.
- **Concurrency**: `maxConcurrentRuns` setting (default 1).
- **No `maxRuns`**: no auto-completion after N runs. Jobs run indefinitely or once.
- **No `manual` trigger**: no on-demand-only job type (though `run` action exists for immediate execution).

**Daymon:**

- **Types**: `cron` (node-cron), `once` (scheduledAt datetime), `manual` (on-demand only).
- **Max runs**: optional `maxRuns` limit, auto-completes after N successful runs.
- **Run tracking**: `runCount` incremented on success, failed runs don't count.
- **Progress tracking**: real-time via `daymon_task_progress` (stream-json parsing).
- **Memory-aware**: context injected before each run, results stored after.
- **Worker assignment**: each task can have a worker with a system prompt.
- **Session continuity**: opt-in per task.

**Key difference**: OpenClaw has more robust scheduling infrastructure (backoff, concurrency, delivery routing). Daymon has maxRuns, on-demand tasks, real-time progress, and task-memory integration that OpenClaw lacks.

---

## 5. Task Execution

**OpenClaw**: In-process agent runtime. Calls LLM APIs directly (Anthropic, OpenAI, etc.). Bundles its own tool implementations (file ops, shell, web, browser, messaging). Optional Docker sandboxing.

**Daymon**: Spawns `claude -p "prompt"` as a subprocess. Delegates to Claude CLI which handles tools natively. No API keys needed — uses the user's Claude subscription.

**Key difference**: OpenClaw is the whole agent. Daymon is an orchestrator that delegates to Claude CLI. This means Daymon requires zero API keys and zero infrastructure — it leverages the user's existing Claude subscription.

---

## 6. MCP Integration

**OpenClaw**: No native MCP support. Multiple rejected PRs and closed issues. Community workarounds exist (MCPorter skill, openclaw-mcp bridges) but cold-start at ~2.4s/call. Uses its own Skills system (5,700+ on ClawHub) and Gateway tool API instead.

**Daymon**: Full native MCP server (stdio + HTTP). 20+ tools for memory, scheduling, file watching, task execution. Works with Claude Desktop and Claude Code out of the box. Auto-configures on first launch.

**Key difference**: Daymon is MCP-native. OpenClaw deliberately avoided MCP in favor of its own ecosystem.

---

## 7. UI

**OpenClaw**: Multiple surfaces — WebChat (React), macOS tray app (voice/health), iOS app, Android app. All chat-focused. Primary interaction is via messaging platforms.

**Daymon**: Single desktop menu bar app with management panels (Status, Memory, Workers, Tasks, Results, Settings). Dashboard-style, not chat-focused.

---

## 8. Unique to Each

### Only in OpenClaw
- Voice wake word + push-to-talk
- 12+ messaging channels (WhatsApp, Telegram, Slack, Discord, Signal, etc.)
- Browser control (Chrome CDP)
- Docker sandboxing per session
- Soul Evolution (self-modifying personality)
- Multi-agent spawning and routing
- Mobile apps (iOS, Android)
- 5,700+ community skills (ClawHub)

### Only in Daymon
- MCP server (native, stdio + HTTP)
- File watchers with custom action prompts
- Max runs / auto-completion
- On-demand (manual) task type
- Real-time task progress tracking
- Task-memory integration (auto-inject context, store results)
- Session continuity for scheduled tasks
- Worker templates
- Zero API keys needed (uses Claude subscription)
- Single-app install (no Docker, no config files)

