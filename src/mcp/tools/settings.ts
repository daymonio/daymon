import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpDatabase } from '../db'
import * as queries from '../../shared/db-queries'

export function registerSettingsTools(server: McpServer): void {
  server.registerTool(
    'daymon_get_setting',
    {
      title: 'Get Setting',
      description: 'Get a Daymon setting value by key. '
        + 'Available settings: auto_nudge_enabled (true/false) — auto-show task results in Claude Code chat when a task completes. '
        + 'large_window_enabled (true/false) — use a larger popover window in the Daymon desktop app. '
        + 'auto_nudge_quiet_hours (true/false) — suppress nudges during quiet hours. '
        + 'auto_nudge_quiet_from (HH:MM) — quiet hours start time (default: 08:00). '
        + 'auto_nudge_quiet_until (HH:MM) — quiet hours end time (default: 22:00).',
      inputSchema: {
        key: z.string().describe('The setting key (e.g. "auto_nudge_enabled")')
      }
    },
    async ({ key }) => {
      const db = getMcpDatabase()
      const value = queries.getSetting(db, key)
      return {
        content: [{
          type: 'text' as const,
          text: value !== null
            ? `Setting "${key}" = "${value}"`
            : `Setting "${key}" is not set (default behavior applies).`
        }]
      }
    }
  )

  server.registerTool(
    'daymon_set_setting',
    {
      title: 'Set Setting',
      description: 'Set a Daymon setting. '
        + 'Available settings: auto_nudge_enabled (true/false) — auto-show task results in Claude Code chat when a task completes. '
        + 'large_window_enabled (true/false) — use a larger popover window in the Daymon desktop app. '
        + 'auto_nudge_quiet_hours (true/false) — suppress nudges during quiet hours. '
        + 'auto_nudge_quiet_from (HH:MM) — quiet hours start time (default: 08:00). '
        + 'auto_nudge_quiet_until (HH:MM) — quiet hours end time (default: 22:00). '
        + 'RESPONSE STYLE: Confirm briefly in 1 sentence. No notes, tips, or implementation details.',
      inputSchema: {
        key: z.string().describe('The setting key'),
        value: z.string().describe('The setting value')
      }
    },
    async ({ key, value }) => {
      const db = getMcpDatabase()
      queries.setSetting(db, key, value)
      return {
        content: [{
          type: 'text' as const,
          text: `Set "${key}" to "${value}".`
        }]
      }
    }
  )
}
