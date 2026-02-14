import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpDatabase } from '../db'
import * as queries from '../../shared/db-queries'

export function registerMemoryTools(server: McpServer): void {
  server.registerTool(
    'daymon_remember',
    {
      title: 'Remember',
      description:
        'Store a memory. Creates an entity with an observation. Use for facts, preferences, project details, people, events.',
      inputSchema: {
        name: z.string().describe('Short name for this memory (e.g. "Series A fundraise", "favorite color")'),
        content: z.string().describe('The detailed information to remember'),
        type: z
          .string()
          .default('fact')
          .describe('Type: fact, preference, person, project, event'),
        category: z
          .string()
          .optional()
          .describe('Category: work, personal, preference, project, person'),
        source: z
          .string()
          .default('claude')
          .describe('Source AI that created this memory: claude or chatgpt')
      }
    },
    async ({ name, content, type, category, source }) => {
      const db = getMcpDatabase()
      const entity = queries.createEntity(db, name, type, category)
      queries.addObservation(db, entity.id, content, source)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Remembered "${name}" (id: ${entity.id}). Stored under ${category ?? 'general'}.`
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_recall',
    {
      title: 'Recall',
      description:
        'Search memories by keyword. Returns matching entities with their observations and relations.',
      inputSchema: {
        query: z.string().describe('Search term to find memories')
      }
    },
    async ({ query }) => {
      const db = getMcpDatabase()
      const entities = queries.searchEntities(db, query)

      if (entities.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No memories found matching "${query}".` }]
        }
      }

      const results = entities.map((entity) => {
        const observations = queries.getObservations(db, entity.id)
        const relations = queries.getRelations(db, entity.id)
        return {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          category: entity.category,
          observations: observations.map((o) => o.content),
          relations: relations.map((r) => ({
            type: r.relation_type,
            fromEntity: r.from_entity,
            toEntity: r.to_entity
          })),
          updatedAt: entity.updated_at
        }
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(results, null, 2)
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_forget',
    {
      title: 'Forget',
      description: 'Delete a memory by its ID. Also removes all related observations and relations.',
      inputSchema: {
        id: z.number().describe('The entity ID to delete')
      }
    },
    async ({ id }) => {
      const db = getMcpDatabase()
      const entity = queries.getEntity(db, id)
      if (!entity) {
        return {
          content: [{ type: 'text' as const, text: `No memory found with id ${id}.` }]
        }
      }
      queries.deleteEntity(db, id)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Forgot "${entity.name}" (id: ${id}).`
          }
        ]
      }
    }
  )

  server.registerTool(
    'daymon_memory_list',
    {
      title: 'Memory List',
      description:
        'List all stored memories, optionally filtered by category. Returns entity names, types, and observation counts.',
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe('Filter by category (work, personal, preference, project, person)')
      }
    },
    async ({ category }) => {
      const db = getMcpDatabase()
      const entities = queries.listEntities(db, category)
      const stats = queries.getMemoryStats(db)

      const list = entities.map((entity) => {
        const observations = queries.getObservations(db, entity.id)
        return {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          category: entity.category,
          observationCount: observations.length,
          updatedAt: entity.updated_at
        }
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                totalEntities: stats.entityCount,
                totalObservations: stats.observationCount,
                totalRelations: stats.relationCount,
                memories: list
              },
              null,
              2
            )
          }
        ]
      }
    }
  )
}
