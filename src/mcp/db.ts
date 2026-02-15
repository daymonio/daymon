import Database from 'better-sqlite3'
import { runMigrations } from '../shared/db-migrations'

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

  runMigrations(db, (msg) => console.error(`MCP server: ${msg}`))

  return db
}

export function closeMcpDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
