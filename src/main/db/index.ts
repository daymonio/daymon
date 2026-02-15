import Database from 'better-sqlite3'
import { getConfig } from '../config'
import { runMigrations } from '../../shared/db-migrations'
import { cleanupAllRunningRuns } from '../../shared/db-queries'

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

  const cleaned = cleanupAllRunningRuns(db)
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} stale task run(s)`)
  }

  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
