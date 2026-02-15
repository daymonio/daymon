import type Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8 } from './schema'

const MIGRATIONS: Array<{ version: number; sql: string; label: string }> = [
  { version: 1, sql: SCHEMA_V1, label: 'initial schema' },
  { version: 2, sql: SCHEMA_V2, label: 'one-time tasks + progress tracking' },
  { version: 3, sql: SCHEMA_V3, label: 'max runs' },
  { version: 4, sql: SCHEMA_V4, label: 'memory-task integration' },
  { version: 5, sql: SCHEMA_V5, label: 'workers, sessions, embeddings' },
  { version: 6, sql: SCHEMA_V6, label: 'task timeout' },
  { version: 7, sql: SCHEMA_V7, label: 'task_runs status index' },
  { version: 8, sql: SCHEMA_V8, label: 'console logs for task runs' }
]

export function runMigrations(database: Database.Database, log: (msg: string) => void = console.log): void {
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

  for (const migration of MIGRATIONS) {
    if (currentVersion < migration.version) {
      database.transaction(() => {
        database.exec(migration.sql)
      })()
      log(`Database schema v${migration.version} applied (${migration.label})`)
    }
  }
}
