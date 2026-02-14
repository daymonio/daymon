import Database from 'better-sqlite3'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7 } from '../../schema'

export function initTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(SCHEMA_V1)
  db.exec(SCHEMA_V2)
  db.exec(SCHEMA_V3)
  db.exec(SCHEMA_V4)
  db.exec(SCHEMA_V5)
  db.exec(SCHEMA_V6)
  db.exec(SCHEMA_V7)
  return db
}
