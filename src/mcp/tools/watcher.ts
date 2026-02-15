import { homedir } from 'os'
import { resolve } from 'path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpDatabase } from '../db'

const SENSITIVE_PATHS = ['/.ssh', '/.gnupg', '/.aws', '/.env']

function validateWatchPath(watchPath: string): string | null {
  const resolved = resolve(watchPath)
  if (!resolved.startsWith('/')) {
    return 'Path must be absolute.'
  }
  const home = homedir()
  if (!resolved.startsWith(home) && !resolved.startsWith('/tmp')) {
    return `Path must be within your home directory (${home}) or /tmp.`
  }
  for (const sensitive of SENSITIVE_PATHS) {
    if (resolved.startsWith(home + sensitive)) {
      return `Cannot watch sensitive directory: ${sensitive}`
    }
  }
  return null
}

export function registerWatcherTools(server: McpServer): void {
  server.registerTool(
    'daymon_watch',
    {
      title: 'Watch Folder',
      description:
        'Watch a file or folder for changes. When a new file is added or a file is modified, Daymon will execute the action prompt using Claude Code CLI. The watcher runs in the Daymon background process.',
      inputSchema: {
        path: z.string().min(1).describe('Absolute path to the file or folder to watch'),
        description: z.string().max(500).optional().describe('Description of what this watch does'),
        actionPrompt: z
          .string()
          .max(50000)
          .describe('The prompt/instruction for Claude to execute when a change is detected')
      }
    },
    async ({ path, description, actionPrompt }) => {
      const pathError = validateWatchPath(path)
      if (pathError) {
        return {
          content: [{ type: 'text' as const, text: `Invalid watch path: ${pathError}` }]
        }
      }

      const db = getMcpDatabase()
      const result = db
        .prepare('INSERT INTO watches (path, description, action_prompt) VALUES (?, ?, ?)')
        .run(path, description ?? null, actionPrompt)
      const id = result.lastInsertRowid as number
      return {
        content: [
          {
            type: 'text' as const,
            text: `Created file watch (id: ${id}) on "${path}".\nThe Daymon app will start watching within 30 seconds. Note: the Daymon desktop app must be running for watches to work.`
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_unwatch',
    {
      title: 'Stop Watching',
      description: 'Stop watching a file or folder by its watch ID.',
      inputSchema: {
        id: z.number().describe('The watch ID to remove')
      }
    },
    async ({ id }) => {
      const db = getMcpDatabase()
      const row = db.prepare('SELECT * FROM watches WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined
      if (!row) {
        return {
          content: [{ type: 'text' as const, text: `No watch found with id ${id}.` }]
        }
      }
      db.prepare('DELETE FROM watches WHERE id = ?').run(id)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Removed watch (id: ${id}) on "${row.path}". The Daymon app will stop watching within 30 seconds.`
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_list_watches',
    {
      title: 'List Watches',
      description: 'List all active file/folder watches.',
      inputSchema: {}
    },
    async () => {
      const db = getMcpDatabase()
      const rows = db.prepare('SELECT * FROM watches ORDER BY created_at DESC').all() as Record<
        string,
        unknown
      >[]

      if (rows.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No active watches.' }]
        }
      }

      const list = rows.map((r) => ({
        id: r.id,
        path: r.path,
        description: r.description,
        status: r.status,
        triggerCount: r.trigger_count,
        lastTriggered: r.last_triggered
      }))

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
}
