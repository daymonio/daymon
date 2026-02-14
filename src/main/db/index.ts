import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getConfig } from '../config'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5 } from '../../shared/schema'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): Database.Database {
  if (db) return db

  const config = getConfig()

  db = new Database(config.dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations(db)

  return db
}

function runMigrations(database: Database.Database): void {
  const hasVersionTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get()

  let currentVersion = 0
  if (hasVersionTable) {
    const row = database
      .prepare('SELECT MAX(version) as version FROM schema_version')
      .get() as { version: number } | undefined
    currentVersion = row?.version ?? 0
  }

  if (currentVersion < 1) {
    const schema = loadSchema()
    database.exec(schema)
    console.log('Database schema v1 applied')
  }

  if (currentVersion < 2) {
    database.exec(SCHEMA_V2)
    console.log('Database schema v2 applied (one-time tasks + progress tracking)')
  }

  if (currentVersion < 3) {
    database.exec(SCHEMA_V3)
    console.log('Database schema v3 applied (max runs)')
  }

  if (currentVersion < 4) {
    database.exec(SCHEMA_V4)
    console.log('Database schema v4 applied (memory-task integration)')
  }

  if (currentVersion < 5) {
    database.exec(SCHEMA_V5)
    console.log('Database schema v5 applied (workers, sessions, embeddings)')
  }
}

function loadSchema(): string {
  try {
    return readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  } catch {
    return SCHEMA_V1
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

