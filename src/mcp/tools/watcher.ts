import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpDatabase } from '../db'
import * as queries from '../../shared/db-queries'
import { validateWatchPath } from '../../shared/watch-path'

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
      const watch = queries.createWatch(db, path, description, actionPrompt)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Created file watch (id: ${watch.id}) on "${path}".`
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
      const watch = queries.getWatch(db, id)
      if (!watch) {
        return {
          content: [{ type: 'text' as const, text: `No watch found with id ${id}.` }]
        }
      }
      queries.deleteWatch(db, id)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Removed watch (id: ${id}) on "${watch.path}".`
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
      const rows = queries.listWatches(db)

      if (rows.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No active watches.' }]
        }
      }

      const list = rows.map((row) => ({
        id: row.id,
        path: row.path,
        description: row.description,
        status: row.status,
        triggerCount: row.triggerCount,
        lastTriggered: row.lastTriggered
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
