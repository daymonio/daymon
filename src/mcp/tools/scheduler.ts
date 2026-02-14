import { join } from 'path'
import { homedir } from 'os'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpDatabase } from '../db'
import * as queries from '../../shared/db-queries'
import { TASK_STATUSES } from '../../shared/constants'
import { executeTask, isTaskRunning } from '../../shared/task-runner'

export function generateTaskName(prompt: string): string {
  const cleaned = prompt.replace(/^(please |can you |i want you to |i need you to )/i, '').trim()
  const firstSentence = cleaned.split(/[.\n]/)[0].trim()
  if (firstSentence.length <= 40) return firstSentence
  return firstSentence.substring(0, 37) + '...'
}

export function registerSchedulerTools(server: McpServer): void {
  server.registerTool(
    'daymon_schedule',
    {
      title: 'Schedule Task',
      description:
        'Create a task — recurring (cron), one-time (specific datetime), or on-demand (manual trigger). '
        + 'Provide cronExpression for recurring, scheduledAt for one-time, or neither for on-demand.',
      inputSchema: {
        name: z.string().optional().describe(
          'Short descriptive name for the task. If omitted, a name will be generated from the prompt. Examples: "HN Morning Digest", "Inbox Summary", "Download Organizer".'
        ),
        prompt: z.string().describe(
          'IMPORTANT: This prompt will be executed by a SEPARATE Claude instance via `claude -p "prompt"` with NO access to the current conversation. '
          + 'The prompt MUST be completely self-contained — include ALL context, requirements, file paths, preferences, and output format. '
          + 'Do NOT reference "the file I mentioned" or "as discussed" — the executing Claude has no memory of this conversation. '
          + 'Good: "Read ~/Documents/notes.md and create a 3-bullet summary, save to ~/Daymon/results/summary.md" '
          + 'Bad: "Summarize that file" (which file? save where?)'
        ),
        cronExpression: z.string().optional().describe(
          'Cron expression for recurring tasks. Translate user\'s natural language to cron: '
          + '"every morning" → "0 9 * * *", "weekdays at 5pm" → "0 17 * * 1-5", "every hour" → "0 * * * *". '
          + 'Omit for one-time or on-demand tasks.'
        ),
        scheduledAt: z.string().optional().describe(
          'ISO-8601 datetime for one-time tasks. Compute from user\'s intent: '
          + '"in 30 minutes" → now + 30min as ISO-8601, "at 3pm today" → today 15:00 as ISO-8601. '
          + 'Omit for recurring or on-demand tasks.'
        ),
        description: z.string().optional().describe('Optional description of what the task does'),
        maxRuns: z.number().optional().describe(
          'Maximum number of successful runs before the task auto-completes. Omit for unlimited.'
        ),
        workerId: z.number().optional().describe(
          'Assign this task to a specific worker by ID. The worker\'s system prompt will be passed via --system-prompt at execution time. '
          + 'If omitted, the default worker (if any) will be used.'
        ),
        sessionContinuity: z.boolean().optional().describe(
          'Enable session continuity across runs. When true, each run continues the previous Claude CLI session, '
          + 'allowing the task to build on prior context naturally (e.g., "compared to yesterday\'s results..."). '
          + 'Default: false (each run is stateless).'
        )
      }
    },
    async ({ name, prompt, cronExpression, scheduledAt, description, maxRuns, workerId, sessionContinuity }) => {
      const db = getMcpDatabase()

      // Auto-determine trigger type
      let triggerType = 'manual'
      if (cronExpression) triggerType = 'cron'
      if (scheduledAt) triggerType = 'once'

      // Auto-generate name if not provided
      const taskName = name || generateTaskName(prompt)

      // Validate one-time task datetime
      if (triggerType === 'once') {
        const date = new Date(scheduledAt!)
        if (isNaN(date.getTime())) {
          return {
            content: [{
              type: 'text' as const,
              text: `Invalid datetime: "${scheduledAt}". Please use ISO-8601 format (e.g. "2026-02-14T15:00:00").`
            }]
          }
        }
        if (date <= new Date()) {
          return {
            content: [{
              type: 'text' as const,
              text: `Scheduled time "${scheduledAt}" is in the past. Please provide a future datetime.`
            }]
          }
        }
      }

      const task = queries.createTask(db, {
        name: taskName,
        prompt,
        cronExpression: cronExpression ?? undefined,
        scheduledAt: scheduledAt ?? undefined,
        triggerType,
        triggerConfig: JSON.stringify({ source: process.env.DAYMON_SOURCE || 'claude-desktop' }),
        description,
        executor: 'claude_code',
        maxRuns: maxRuns ?? undefined,
        workerId: workerId ?? undefined,
        sessionContinuity: sessionContinuity ?? false
      })

      // Response varies by type
      const maxRunsNote = maxRuns ? `\nWill auto-complete after ${maxRuns} successful run(s).` : ''
      const workerNote = workerId ? (() => { const w = queries.getWorker(db, workerId); return w ? `\nWorker: ${w.name}` : '' })() : ''
      const sessionNote = sessionContinuity ? '\nSession continuity: enabled' : ''
      if (triggerType === 'cron') {
        return {
          content: [{
            type: 'text' as const,
            text: `Scheduled recurring task "${taskName}" (id: ${task.id}).\nSchedule: ${cronExpression}${maxRunsNote}${workerNote}${sessionNote}\nThe Daymon scheduler will pick it up within 30 seconds.`
          }]
        }
      } else if (triggerType === 'once') {
        const diffMs = new Date(scheduledAt!).getTime() - Date.now()
        const diffMins = Math.round(diffMs / 60000)
        const timeDesc = diffMins < 60
          ? `${diffMins} minute(s)`
          : `${Math.floor(diffMins / 60)} hour(s) and ${diffMins % 60} minute(s)`
        return {
          content: [{
            type: 'text' as const,
            text: `Scheduled one-time task "${taskName}" (id: ${task.id}).\nRuns at: ${scheduledAt}\nTime until execution: ~${timeDesc}${workerNote}${sessionNote}\nThe Daymon scheduler checks every 30 seconds.`
          }]
        }
      } else {
        return {
          content: [{
            type: 'text' as const,
            text: `Created on-demand task "${taskName}" (id: ${task.id}).${workerNote}${sessionNote}\nRun it anytime with daymon_run_task.`
          }]
        }
      }
    }
  )

  server.registerTool(
    'daymon_list_tasks',
    {
      title: 'List Tasks',
      description: 'List all scheduled tasks, optionally filtered by status.',
      inputSchema: {
        status: z.string().optional().describe('Filter by status: active, paused, completed (omit for all)')
      }
    },
    async ({ status }) => {
      const db = getMcpDatabase()
      const tasks = queries.listTasks(db, status)

      if (tasks.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No tasks found.' }]
        }
      }

      const list = tasks.map((t) => {
        const worker = t.workerId ? queries.getWorker(db, t.workerId) : null
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          triggerType: t.triggerType,
          schedule: t.cronExpression,
          scheduledAt: t.scheduledAt,
          lastRun: t.lastRun,
          errorCount: t.errorCount,
          maxRuns: t.maxRuns,
          runCount: t.runCount,
          description: t.description,
          workerId: t.workerId,
          workerName: worker?.name ?? null,
          sessionContinuity: t.sessionContinuity
        }
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(list, null, 2)
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_run_task',
    {
      title: 'Run Task Now',
      description: 'Execute a task immediately and return the result. This spawns a Claude CLI process to run the task prompt.',
      inputSchema: {
        id: z.number().describe('The task ID to run')
      }
    },
    async ({ id }) => {
      const db = getMcpDatabase()
      const task = queries.getTask(db, id)
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `No task found with id ${id}.` }]
        }
      }

      if (isTaskRunning(id)) {
        return {
          content: [{ type: 'text' as const, text: `Task "${task.name}" (id: ${id}) is already running.` }]
        }
      }

      // Ensure task is active for execution
      if (task.status !== TASK_STATUSES.ACTIVE) {
        queries.updateTask(db, id, { status: TASK_STATUSES.ACTIVE })
      }

      const resultsDir = join(homedir(), 'Daymon', 'results')
      const result = await executeTask(id, { db, resultsDir })

      if (result.success) {
        return {
          content: [{
            type: 'text' as const,
            text: `Task "${task.name}" completed in ${(result.durationMs / 1000).toFixed(1)}s.\n\n${result.output}`
          }]
        }
      } else {
        return {
          content: [{
            type: 'text' as const,
            text: `Task "${task.name}" failed: ${result.errorMessage}\n\n${result.output}`
          }],
          isError: true
        }
      }
    }
  )

  server.registerTool(
    'daymon_pause_task',
    {
      title: 'Pause Task',
      description: 'Pause a scheduled task by its ID. The task will not run until resumed.',
      inputSchema: {
        id: z.number().describe('The task ID to pause')
      }
    },
    async ({ id }) => {
      const db = getMcpDatabase()
      const task = queries.getTask(db, id)
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `No task found with id ${id}.` }]
        }
      }
      queries.pauseTask(db, id)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Paused task "${task.name}" (id: ${id}).`
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_resume_task',
    {
      title: 'Resume Task',
      description: 'Resume a paused task by its ID.',
      inputSchema: {
        id: z.number().describe('The task ID to resume')
      }
    },
    async ({ id }) => {
      const db = getMcpDatabase()
      const task = queries.getTask(db, id)
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `No task found with id ${id}.` }]
        }
      }
      queries.resumeTask(db, id)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Resumed task "${task.name}" (id: ${id}).`
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_delete_task',
    {
      title: 'Delete Task',
      description: 'Delete a scheduled task by its ID. This also removes all run history.',
      inputSchema: {
        id: z.number().describe('The task ID to delete')
      }
    },
    async ({ id }) => {
      const db = getMcpDatabase()
      const task = queries.getTask(db, id)
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `No task found with id ${id}.` }]
        }
      }
      queries.deleteTask(db, id)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Deleted task "${task.name}" (id: ${id}).`
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_task_history',
    {
      title: 'Task History',
      description: 'Show recent execution history for a task.',
      inputSchema: {
        taskId: z.number().describe('The task ID to get history for'),
        limit: z.number().default(10).describe('Maximum number of runs to return')
      }
    },
    async ({ taskId, limit }) => {
      const db = getMcpDatabase()
      const task = queries.getTask(db, taskId)
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `No task found with id ${taskId}.` }]
        }
      }

      const runs = queries.getTaskRuns(db, taskId, limit)

      if (runs.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No runs found for task "${task.name}".` }]
        }
      }

      const history = runs.map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.durationMs,
        error: r.errorMessage,
        resultFile: r.resultFile
      }))

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ task: task.name, runs: history }, null, 2)
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_task_progress',
    {
      title: 'Task Progress',
      description: 'Check the current execution progress of a running task.',
      inputSchema: {
        taskId: z.number().describe('The task ID to check progress for')
      }
    },
    async ({ taskId }) => {
      const db = getMcpDatabase()
      const task = queries.getTask(db, taskId)
      if (!task) {
        return {
          content: [{ type: 'text' as const, text: `No task found with id ${taskId}.` }]
        }
      }

      const latestRun = queries.getLatestTaskRun(db, taskId)
      if (!latestRun) {
        return {
          content: [{ type: 'text' as const, text: `No runs found for task "${task.name}".` }]
        }
      }

      if (latestRun.status !== 'running') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              task: task.name,
              runId: latestRun.id,
              status: latestRun.status,
              progress: latestRun.progress,
              progressMessage: latestRun.progressMessage,
              finishedAt: latestRun.finishedAt,
              durationMs: latestRun.durationMs
            }, null, 2)
          }]
        }
      }

      const elapsedMs = Date.now() - new Date(latestRun.startedAt).getTime()
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            task: task.name,
            runId: latestRun.id,
            status: 'running',
            progress: latestRun.progress,
            progressMessage: latestRun.progressMessage,
            elapsedMs,
            elapsedFormatted: `${(elapsedMs / 1000).toFixed(1)}s`
          }, null, 2)
        }]
      }
    }
  )

  server.registerTool(
    'daymon_reset_session',
    {
      title: 'Reset Task Session',
      description: 'Clear the session for a task, forcing the next run to start a fresh conversation. Only relevant for tasks with session continuity enabled.',
      inputSchema: {
        id: z.number().describe('The task ID to reset the session for')
      }
    },
    async ({ id }) => {
      const db = getMcpDatabase()
      const task = queries.getTask(db, id)
      if (!task) {
        return { content: [{ type: 'text' as const, text: `No task found with id ${id}.` }] }
      }
      queries.clearTaskSession(db, id)
      return {
        content: [{
          type: 'text' as const,
          text: `Session cleared for task "${task.name}" (id: ${id}). Next run will start a fresh conversation.`
        }]
      }
    }
  )
}
