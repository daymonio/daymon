import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpDatabase } from '../db'

export function registerWatcherTools(server: McpServer): void {
  server.registerTool(
    'daymon_watch',
    {
      title: 'Watch Folder',
      description:
        'Watch a file or folder for changes. When a new file is added or a file is modified, Daymon will execute the action prompt using Claude Code CLI. The watcher runs in the Daymon background process.',
      inputSchema: {
        path: z.string().describe('Absolute path to the file or folder to watch'),
        description: z.string().optional().describe('Description of what this watch does'),
        actionPrompt: z
          .string()
          .describe('The prompt/instruction for Claude to execute when a change is detected')
      }
    },
    async ({ path, description, actionPrompt }) => {
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
