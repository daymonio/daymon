PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Entities (facts, preferences, people, projects, etc.)
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

-- Observations (individual facts about an entity)
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'claude',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_observations_entity_id ON observations(entity_id);

-- Relations (connections between entities)
CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity);

-- Full text search on memories
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    name,
    content,
    category,
    content='entities',
    content_rowid='id'
);

-- FTS triggers to keep index in sync
CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
    INSERT INTO memory_fts(rowid, name, content, category)
    VALUES (new.id, new.name, '', new.category);
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, name, content, category)
    VALUES ('delete', old.id, old.name, '', old.category);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, name, content, category)
    VALUES ('delete', old.id, old.name, '', old.category);
    INSERT INTO memory_fts(rowid, name, content, category)
    VALUES (new.id, new.name, '', new.category);
END;

-- Scheduled tasks
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

-- Task execution history
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

-- File system watches
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

-- App settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
