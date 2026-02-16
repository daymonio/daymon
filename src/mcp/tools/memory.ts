import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type Database from 'better-sqlite3'
import { getMcpDatabase } from '../db'
import * as queries from '../../shared/db-queries'
import { embed, isEngineReady, cosineSimilarity, blobToVector, initEngine } from '../../shared/embeddings'

// Fire-and-forget engine init on first memory tool registration
let engineInitStarted = false
function ensureEngineInit(): void {
  if (!engineInitStarted) {
    engineInitStarted = true
    initEngine().catch(() => { /* non-fatal */ })
  }
}

// ─── Embedding cache ────────────────────────────────────────
// Avoids reloading all embeddings from disk on every recall query.
// Cache is invalidated every 60s so new memories are picked up.
let embeddingCache: Array<{ entityId: number; vector: Float32Array }> | null = null
let embeddingCacheTime = 0
const EMBEDDING_CACHE_TTL_MS = 60_000

function getCachedEmbeddings(db: Database.Database): Array<{ entityId: number; vector: Float32Array }> {
  const now = Date.now()
  if (embeddingCache && now - embeddingCacheTime < EMBEDDING_CACHE_TTL_MS) {
    return embeddingCache
  }
  const raw = queries.getAllEmbeddings(db)
  embeddingCache = raw.map(e => ({
    entityId: e.entityId,
    vector: blobToVector(e.vector)
  }))
  embeddingCacheTime = now
  return embeddingCache
}

export function registerMemoryTools(server: McpServer): void {
  ensureEngineInit()

  server.registerTool(
    'daymon_remember',
    {
      title: 'Remember',
      description:
        'Store a memory. Creates an entity with an observation. Use for facts, preferences, project details, people, events. '
        + 'RESPONSE STYLE: Confirm briefly in 1 sentence. No notes, tips, or implementation details.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('Short name for this memory (e.g. "Series A fundraise", "favorite color")'),
        content: z.string().min(1).max(50000).describe('The detailed information to remember'),
        type: z
          .enum(['fact', 'preference', 'person', 'project', 'event'])
          .default('fact')
          .describe('Type: fact, preference, person, project, event'),
        category: z
          .enum(['work', 'personal', 'preference', 'project', 'person'])
          .optional()
          .describe('Category: work, personal, preference, project, person'),
      }
    },
    async ({ name, content, type, category }) => {
      const db = getMcpDatabase()
      const entity = queries.createEntity(db, name, type, category)
      queries.addObservation(db, entity.id, content, 'claude')
      return {
        content: [
          {
            type: 'text' as const,
            text: `Remembered "${name}".`
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

      // Try hybrid search if embedding engine is ready
      let semanticResults: Array<{ entityId: number; score: number }> | null = null
      if (isEngineReady()) {
        try {
          const queryVec = await embed(query)
          if (queryVec) {
            const cached = getCachedEmbeddings(db)
            semanticResults = cached
              .map(e => ({
                entityId: e.entityId,
                score: cosineSimilarity(queryVec, e.vector)
              }))
              .filter(e => e.score > 0.3)
              .sort((a, b) => b.score - a.score)
              .slice(0, 20)
          }
        } catch {
          // Non-fatal: fall through to FTS-only
        }
      }

      const hybridResults = queries.hybridSearch(db, query, semanticResults)

      if (hybridResults.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No memories found matching "${query}".` }]
        }
      }

      const results = hybridResults.map((hr) => {
        const observations = queries.getObservations(db, hr.entity.id)
        const relations = queries.getRelations(db, hr.entity.id)
        return {
          id: hr.entity.id,
          name: hr.entity.name,
          type: hr.entity.type,
          category: hr.entity.category,
          score: Math.round(hr.combinedScore * 1000) / 1000,
          observations: observations.map((o) => o.content),
          relations: relations.map((r) => ({
            type: r.relation_type,
            fromEntity: r.from_entity,
            toEntity: r.to_entity
          })),
          updatedAt: hr.entity.updated_at
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
      description: 'Delete a memory by its ID. Also removes all related observations and relations. '
        + 'RESPONSE STYLE: Confirm briefly in 1 sentence. No notes, tips, or implementation details.',
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
            text: `Forgot "${entity.name}".`
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
