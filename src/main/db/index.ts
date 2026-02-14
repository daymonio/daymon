import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getConfig } from '../config'

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

// Inline fallback for production builds where schema.sql may not be on disk
const SCHEMA_V1 = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'fact',
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entities_category ON entities(category);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'claude',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_observations_entity_id ON observations(entity_id);

CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    name, content, category, content='entities', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
    INSERT INTO memory_fts(rowid, name, content, category) VALUES (new.id, new.name, '', new.category);
END;
CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, name, content, category) VALUES ('delete', old.id, old.name, '', old.category);
END;
CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, name, content, category) VALUES ('delete', old.id, old.name, '', old.category);
    INSERT INTO memory_fts(rowid, name, content, category) VALUES (new.id, new.name, '', new.category);
END;

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    cron_expression TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'cron',
    trigger_config TEXT,
    executor TEXT NOT NULL DEFAULT 'claude_code',
    status TEXT NOT NULL DEFAULT 'active',
    last_run DATETIME,
    last_result TEXT,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    status TEXT NOT NULL DEFAULT 'running',
    result TEXT,
    result_file TEXT,
    error_message TEXT,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_task_runs_task_id ON task_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_runs_started_at ON task_runs(started_at);

CREATE TABLE IF NOT EXISTS watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    description TEXT,
    action_prompt TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_triggered DATETIME,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
`
