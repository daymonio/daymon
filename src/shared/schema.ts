export const SCHEMA_V1 = `
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

export const SCHEMA_V2 = `
ALTER TABLE tasks ADD COLUMN scheduled_at DATETIME;
ALTER TABLE task_runs ADD COLUMN progress REAL;
ALTER TABLE task_runs ADD COLUMN progress_message TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at ON tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tasks_trigger_type ON tasks(trigger_type);
INSERT OR IGNORE INTO schema_version (version) VALUES (2);
`

export const SCHEMA_V3 = `
ALTER TABLE tasks ADD COLUMN max_runs INTEGER;
ALTER TABLE tasks ADD COLUMN run_count INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO schema_version (version) VALUES (3);
`

export const SCHEMA_V4 = `
ALTER TABLE tasks ADD COLUMN memory_entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL;
INSERT OR IGNORE INTO schema_version (version) VALUES (4);
`

export const SCHEMA_V5 = `
CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    description TEXT,
    model TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    task_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);

ALTER TABLE tasks ADD COLUMN worker_id INTEGER REFERENCES workers(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN session_continuity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN session_id TEXT;
ALTER TABLE task_runs ADD COLUMN session_id TEXT;

CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL DEFAULT 'entity',
    source_id INTEGER NOT NULL,
    text_hash TEXT NOT NULL,
    vector BLOB NOT NULL,
    model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    dimensions INTEGER NOT NULL DEFAULT 384,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_embeddings_entity_id ON embeddings(entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id, model);
ALTER TABLE entities ADD COLUMN embedded_at DATETIME;

INSERT OR IGNORE INTO schema_version (version) VALUES (5);
`

export const SCHEMA_V6 = `
ALTER TABLE tasks ADD COLUMN timeout_minutes INTEGER;
INSERT OR IGNORE INTO schema_version (version) VALUES (6);
`

export const SCHEMA_V7 = `
CREATE INDEX IF NOT EXISTS idx_task_runs_status ON task_runs(status);
INSERT OR IGNORE INTO schema_version (version) VALUES (7);
`
