import { getDatabase } from './index'
import type { Entity, Observation, Relation, MemoryStats } from '../../shared/types'

// ─── Entities ───────────────────────────────────────────────

export function createEntity(name: string, type: string = 'fact', category?: string): Entity {
  const db = getDatabase()
  const result = db
    .prepare('INSERT INTO entities (name, type, category) VALUES (?, ?, ?)')
    .run(name, type, category ?? null)
  return getEntity(result.lastInsertRowid as number)!
}

export function getEntity(id: number): Entity | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Entity | undefined
  return row ?? null
}

export function listEntities(category?: string): Entity[] {
  const db = getDatabase()
  if (category) {
    return db
      .prepare('SELECT * FROM entities WHERE category = ? ORDER BY updated_at DESC')
      .all(category) as Entity[]
  }
  return db.prepare('SELECT * FROM entities ORDER BY updated_at DESC').all() as Entity[]
}

export function updateEntity(id: number, updates: { name?: string; type?: string; category?: string }): void {
  const db = getDatabase()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
  if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type) }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category) }
  if (fields.length === 0) return

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  db.prepare(`UPDATE entities SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteEntity(id: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM entities WHERE id = ?').run(id)
}

export function searchEntities(query: string): Entity[] {
  const db = getDatabase()
  const ftsResults = db
    .prepare(
      `SELECT e.* FROM entities e
       INNER JOIN memory_fts fts ON e.id = fts.rowid
       WHERE memory_fts MATCH ?
       ORDER BY rank`
    )
    .all(query) as Entity[]

  if (ftsResults.length === 0) {
    return db
      .prepare('SELECT * FROM entities WHERE name LIKE ? OR category LIKE ? ORDER BY updated_at DESC')
      .all(`%${query}%`, `%${query}%`) as Entity[]
  }
  return ftsResults
}

// ─── Observations ───────────────────────────────────────────

export function addObservation(entityId: number, content: string, source: string = 'claude'): Observation {
  const db = getDatabase()
  const result = db
    .prepare('INSERT INTO observations (entity_id, content, source) VALUES (?, ?, ?)')
    .run(entityId, content, source)
  db.prepare('UPDATE entities SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(entityId)
  return getObservation(result.lastInsertRowid as number)!
}

export function getObservation(id: number): Observation | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM observations WHERE id = ?').get(id) as Observation | undefined
  return row ?? null
}

export function getObservations(entityId: number): Observation[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM observations WHERE entity_id = ? ORDER BY created_at DESC')
    .all(entityId) as Observation[]
}

export function deleteObservation(id: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM observations WHERE id = ?').run(id)
}

// ─── Relations ──────────────────────────────────────────────

export function addRelation(fromEntity: number, toEntity: number, relationType: string): Relation {
  const db = getDatabase()
  const result = db
    .prepare('INSERT INTO relations (from_entity, to_entity, relation_type) VALUES (?, ?, ?)')
    .run(fromEntity, toEntity, relationType)
  return getRelation(result.lastInsertRowid as number)!
}

export function getRelation(id: number): Relation | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM relations WHERE id = ?').get(id) as Relation | undefined
  return row ?? null
}

export function getRelations(entityId: number): Relation[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM relations WHERE from_entity = ? OR to_entity = ? ORDER BY created_at DESC')
    .all(entityId, entityId) as Relation[]
}

export function deleteRelation(id: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM relations WHERE id = ?').run(id)
}

// ─── Stats ──────────────────────────────────────────────────

export function getMemoryStats(): MemoryStats {
  const db = getDatabase()
  const entities = db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number }
  const observations = db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number }
  const relations = db.prepare('SELECT COUNT(*) as count FROM relations').get() as { count: number }
  return {
    entityCount: entities.count,
    observationCount: observations.count,
    relationCount: relations.count
  }
}
