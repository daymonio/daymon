import Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2 } from '../shared/schema'

let db: Database.Database | null = null

export function getMcpDatabase(): Database.Database {
  if (db) return db

  const dbPath = process.env.DAYMON_DB_PATH
  if (!dbPath) {
    throw new Error('DAYMON_DB_PATH environment variable is not set')
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  ensureSchema(db)

  return db
}

function ensureSchema(database: Database.Database): void {
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
    database.exec(SCHEMA_V1)
    console.error('MCP server: database schema v1 applied')
  }

  if (currentVersion < 2) {
    database.exec(SCHEMA_V2)
    console.error('MCP server: database schema v2 applied (one-time tasks + progress tracking)')
  }
}
