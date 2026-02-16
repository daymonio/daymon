import type Database from 'better-sqlite3'
import { SCHEMA, MIGRATIONS } from './schema'

export function runMigrations(database: Database.Database, log: (msg: string) => void = console.log): void {
  const hasVersionTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get()

  if (!hasVersionTable) {
    // Fresh install: create everything in one shot
    database.exec(SCHEMA)
    log('Database schema initialized (fresh install)')
    return
  }

  // Existing database: apply incremental migrations
  const row = database
    .prepare('SELECT MAX(version) as version FROM schema_version')
    .get() as { version: number } | undefined
  const currentVersion = row?.version ?? 0

  for (const migration of MIGRATIONS) {
    if (currentVersion < migration.version) {
      database.transaction(() => {
        database.exec(migration.sql)
      })()
      log(`Database schema v${migration.version} applied (${migration.label})`)
    }
  }
}
