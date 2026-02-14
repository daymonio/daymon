import { getDatabase } from './index'
import * as queries from '../../shared/db-queries'
import type { Entity, Observation, Relation, MemoryStats } from '../../shared/types'

// ─── Entities ───────────────────────────────────────────────

export function createEntity(name: string, type?: string, category?: string): Entity {
  return queries.createEntity(getDatabase(), name, type, category)
}

export function getEntity(id: number): Entity | null {
  return queries.getEntity(getDatabase(), id)
}

export function listEntities(category?: string): Entity[] {
  return queries.listEntities(getDatabase(), category)
}

export function updateEntity(id: number, updates: { name?: string; type?: string; category?: string }): void {
  return queries.updateEntity(getDatabase(), id, updates)
}

export function deleteEntity(id: number): void {
  return queries.deleteEntity(getDatabase(), id)
}

export function searchEntities(query: string): Entity[] {
  return queries.searchEntities(getDatabase(), query)
}

// ─── Observations ───────────────────────────────────────────

export function addObservation(entityId: number, content: string, source?: string): Observation {
  return queries.addObservation(getDatabase(), entityId, content, source)
}

export function getObservation(id: number): Observation | null {
  return queries.getObservation(getDatabase(), id)
}

export function getObservations(entityId: number): Observation[] {
  return queries.getObservations(getDatabase(), entityId)
}

export function deleteObservation(id: number): void {
  return queries.deleteObservation(getDatabase(), id)
}

// ─── Relations ──────────────────────────────────────────────

export function addRelation(fromEntity: number, toEntity: number, relationType: string): Relation {
  return queries.addRelation(getDatabase(), fromEntity, toEntity, relationType)
}

export function getRelation(id: number): Relation | null {
  return queries.getRelation(getDatabase(), id)
}

export function getRelations(entityId: number): Relation[] {
  return queries.getRelations(getDatabase(), entityId)
}

export function deleteRelation(id: number): void {
  return queries.deleteRelation(getDatabase(), id)
}

// ─── Stats ──────────────────────────────────────────────────

export function getMemoryStats(): MemoryStats {
  return queries.getMemoryStats(getDatabase())
}
