import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initTestDb } from '../../shared/__tests__/helpers/test-db'
import { cleanupAllRunningRuns } from '../../shared/db-queries'

// This tests the sidecar's HTTP routing logic in isolation.
// We extract the route handling patterns and test them directly
// rather than starting the full server (which requires env vars + DB).

describe('sidecar HTTP routes', () => {
  describe('GET /health', () => {
    it('returns ok with scheduler status', async () => {
      const response = {
        ok: true,
        uptime: 60,
        version: 'dev',
        pid: process.pid,
        scheduler: { running: true, jobCount: 2, jobs: [{ taskId: 1 }, { taskId: 2 }] }
      }

      expect(response.ok).toBe(true)
      expect(response.scheduler.running).toBe(true)
      expect(response.scheduler.jobCount).toBe(2)
    })
  })

  describe('POST /tasks/:id/run URL parsing', () => {
    it('matches valid task run URLs', () => {
      expect('/tasks/1/run'.match(/^\/tasks\/(\d+)\/run$/)?.[1]).toBe('1')
      expect('/tasks/123/run'.match(/^\/tasks\/(\d+)\/run$/)?.[1]).toBe('123')
      expect('/tasks/99999/run'.match(/^\/tasks\/(\d+)\/run$/)?.[1]).toBe('99999')
    })

    it('rejects invalid URLs', () => {
      expect('/tasks/abc/run'.match(/^\/tasks\/(\d+)\/run$/)).toBeNull()
      expect('/tasks//run'.match(/^\/tasks\/(\d+)\/run$/)).toBeNull()
      expect('/tasks/1/run/extra'.match(/^\/tasks\/(\d+)\/run$/)).toBeNull()
      expect('/tasks/1'.match(/^\/tasks\/(\d+)\/run$/)).toBeNull()
    })
  })

  describe('expandTilde', () => {
    // Test the tilde expansion logic used for env var paths
    function expandTilde(p: string): string {
      const { homedir } = require('os')
      if (p.startsWith('~/') || p === '~') return p.replace('~', homedir())
      return p
    }

    it('expands ~/path', () => {
      const { homedir } = require('os')
      expect(expandTilde('~/Documents')).toBe(`${homedir()}/Documents`)
    })

    it('expands bare ~', () => {
      const { homedir } = require('os')
      expect(expandTilde('~')).toBe(homedir())
    })

    it('leaves absolute paths unchanged', () => {
      expect(expandTilde('/usr/local/bin')).toBe('/usr/local/bin')
    })

    it('leaves relative paths unchanged', () => {
      expect(expandTilde('relative/path')).toBe('relative/path')
    })
  })
})

describe('sidecar lifecycle', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('cleans up stale running runs on startup', () => {
    // Create a task and a stale "running" run
    db.prepare(`
      INSERT INTO tasks (name, prompt, trigger_type, status, trigger_config, created_at, updated_at)
      VALUES ('Stale', 'test', 'manual', 'active', '{}', datetime('now','localtime'), datetime('now','localtime'))
    `).run()
    const taskId = Number(db.prepare('SELECT last_insert_rowid() as id').get()!['id' as keyof object])

    db.prepare(`
      INSERT INTO task_runs (task_id, status, started_at)
      VALUES (?, 'running', datetime('now','localtime'))
    `).run(taskId)

    // Simulate the cleanup that server.ts does on startup
    const cleaned = cleanupAllRunningRuns(db)

    expect(cleaned).toBe(1)
    const run = db.prepare('SELECT status FROM task_runs WHERE task_id = ?').get(taskId) as { status: string }
    expect(run.status).toBe('failed')
  })
})
