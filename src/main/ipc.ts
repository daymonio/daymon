import { ipcMain, app, BrowserWindow } from 'electron'
import { resizePopoverWindow } from './tray'
import * as memory from './db/memory'
import * as tasks from './db/tasks'
import { executeTask } from './scheduler/runner'
import { getConfig, getClaudeConfigPath } from './config'
import { checkClaudeCliAvailable } from '../shared/claude-code'
import { startWatch, stopWatch } from './file-watcher'
import { uninstall } from './uninstall'
import { checkForUpdates, downloadUpdate, installUpdate, getUpdateStatus } from './updater'
import { getClaudeIntegrationStatus } from './claude-config'
import { getSchedulerStatus } from './scheduler/cron'
import { testNotification } from './notifications'
import { z } from 'zod'
import type { CreateTaskInput, CreateWorkerInput } from '../shared/types'
import {
  createTaskSchema,
  createWatchSchema,
  createWorkerSchema,
  idSchema,
  settingsKeySchema,
  settingsValueSchema,
  updateTaskSchema,
  updateWorkerSchema
} from '../shared/validation'

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
  }
  return parsed.data
}

export function registerIpcHandlers(): void {
  // ─── Memory: Entities ───────────────────────────────────

  ipcMain.handle('memory:createEntity', (_e, name: string, type?: string, category?: string) =>
    memory.createEntity(name, type, category)
  )
  ipcMain.handle('memory:getEntity', (_e, id: number) => memory.getEntity(parseOrThrow(idSchema, id)))
  ipcMain.handle('memory:listEntities', (_e, category?: string) => memory.listEntities(category))
  ipcMain.handle('memory:searchEntities', (_e, query: string) => memory.searchEntities(query))
  ipcMain.handle('memory:deleteEntity', (_e, id: number) => memory.deleteEntity(parseOrThrow(idSchema, id)))

  // ─── Memory: Observations ─────────────────────────────

  ipcMain.handle('memory:addObservation', (_e, entityId: number, content: string, source?: string) =>
    memory.addObservation(parseOrThrow(idSchema, entityId), content, source)
  )
  ipcMain.handle('memory:getObservations', (_e, entityId: number) => memory.getObservations(parseOrThrow(idSchema, entityId)))
  ipcMain.handle('memory:deleteObservation', (_e, id: number) => memory.deleteObservation(parseOrThrow(idSchema, id)))

  // ─── Memory: Relations ────────────────────────────────

  ipcMain.handle('memory:addRelation', (_e, fromEntity: number, toEntity: number, relationType: string) =>
    memory.addRelation(parseOrThrow(idSchema, fromEntity), parseOrThrow(idSchema, toEntity), relationType)
  )
  ipcMain.handle('memory:getRelations', (_e, entityId: number) => memory.getRelations(parseOrThrow(idSchema, entityId)))
  ipcMain.handle('memory:deleteRelation', (_e, id: number) => memory.deleteRelation(parseOrThrow(idSchema, id)))

  // ─── Memory: Stats ───────────────────────────────────

  ipcMain.handle('memory:getStats', () => memory.getMemoryStats())

  // ─── Workers ────────────────────────────────────────────

  ipcMain.handle('workers:create', (_e, input: CreateWorkerInput) => {
    const validated = parseOrThrow(createWorkerSchema, input)
    return tasks.createWorker(validated)
  })
  ipcMain.handle('workers:get', (_e, id: number) => tasks.getWorker(parseOrThrow(idSchema, id)))
  ipcMain.handle('workers:list', () => tasks.listWorkers())
  ipcMain.handle('workers:update', (_e, id: number, updates: Record<string, unknown>) => {
    const validatedId = parseOrThrow(idSchema, id)
    const validatedUpdates = parseOrThrow(updateWorkerSchema, updates)
    tasks.updateWorker(validatedId, validatedUpdates)
  })
  ipcMain.handle('workers:delete', (_e, id: number) => tasks.deleteWorker(parseOrThrow(idSchema, id)))
  ipcMain.handle('workers:getDefault', () => tasks.getDefaultWorker())
  ipcMain.handle('workers:count', () => tasks.getWorkerCount())

  // ─── Tasks ────────────────────────────────────────────

  ipcMain.handle('tasks:create', (_e, task: CreateTaskInput) => {
    const validated = parseOrThrow(createTaskSchema, task)
    return tasks.createTask({
      ...validated,
      triggerConfig: JSON.stringify({ source: 'daymon' })
    })
  })
  ipcMain.handle('tasks:get', (_e, id: number) => tasks.getTask(parseOrThrow(idSchema, id)))
  ipcMain.handle('tasks:list', (_e, status?: string) => {
    const validatedStatus = parseOrThrow(z.enum(['active', 'paused', 'completed']).optional(), status)
    return tasks.listTasks(validatedStatus)
  })
  ipcMain.handle('tasks:update', (_e, id: number, updates: Record<string, unknown>) => {
    const validatedId = parseOrThrow(idSchema, id)
    const validatedUpdates = parseOrThrow(updateTaskSchema, updates)
    tasks.updateTask(validatedId, validatedUpdates)
  })
  ipcMain.handle('tasks:delete', (_e, id: number) => tasks.deleteTask(parseOrThrow(idSchema, id)))
  ipcMain.handle('tasks:pause', (_e, id: number) => tasks.pauseTask(parseOrThrow(idSchema, id)))
  ipcMain.handle('tasks:resume', (_e, id: number) => tasks.resumeTask(parseOrThrow(idSchema, id)))
  ipcMain.handle('tasks:getRuns', (_e, taskId: number) => tasks.getTaskRuns(parseOrThrow(idSchema, taskId)))
  ipcMain.handle('tasks:getLatestRun', (_e, taskId: number) => tasks.getLatestTaskRun(parseOrThrow(idSchema, taskId)))
  ipcMain.handle('tasks:listAllRuns', (_e, limit?: number) => {
    const validatedLimit = parseOrThrow(z.number().int().min(1).max(200).optional().default(20), limit)
    return tasks.listAllRuns(validatedLimit)
  })
  ipcMain.handle('tasks:runNow', (_e, id: number) => executeTask(parseOrThrow(idSchema, id)))
  ipcMain.handle('tasks:getRunningRuns', () => tasks.getRunningTaskRuns())
  ipcMain.handle('tasks:getConsoleLogs', (_e, runId: number, afterSeq?: number, limit?: number) => {
    const validatedRunId = parseOrThrow(idSchema, runId)
    const validatedAfterSeq = parseOrThrow(z.number().int().min(0).optional().default(0), afterSeq)
    const validatedLimit = parseOrThrow(z.number().int().min(1).max(500).optional().default(100), limit)
    return tasks.getConsoleLogs(validatedRunId, validatedAfterSeq, validatedLimit)
  })

  // ─── Settings ─────────────────────────────────────────

  ipcMain.handle('settings:get', (_e, key: string) => tasks.getSetting(parseOrThrow(settingsKeySchema, key)))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    const validatedKey = parseOrThrow(settingsKeySchema, key)
    const validatedValue = parseOrThrow(settingsValueSchema, value)
    tasks.setSetting(validatedKey, validatedValue)
  })
  ipcMain.handle('settings:getAll', () => tasks.getAllSettings())

  // ─── Watches ─────────────────────────────────────────

  ipcMain.handle('watches:create', (_e, path: string, description?: string, actionPrompt?: string) => {
    const validated = parseOrThrow(createWatchSchema, { path, description, actionPrompt })
    const watch = tasks.createWatch(validated.path, validated.description, validated.actionPrompt)
    startWatch(watch)
    return watch
  })
  ipcMain.handle('watches:list', (_e, status?: string) => {
    const validatedStatus = parseOrThrow(z.enum(['active']).optional(), status)
    return tasks.listWatches(validatedStatus)
  })
  ipcMain.handle('watches:delete', (_e, id: number) => {
    const validatedId = parseOrThrow(idSchema, id)
    stopWatch(validatedId)
    tasks.deleteWatch(validatedId)
  })
  ipcMain.handle('watches:count', (_e, status?: string) => {
    const validatedStatus = parseOrThrow(z.enum(['active']).optional(), status)
    return tasks.getWatchCount(validatedStatus)
  })

  // ─── App ──────────────────────────────────────────────

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('app:getPaths', () => {
    const config = getConfig()
    return {
      dbPath: config.dbPath,
      resultsDir: config.resultsDir,
      dataDir: config.dataDir,
      claudeConfigPath: getClaudeConfigPath()
    }
  })
  ipcMain.handle('app:checkClaude', () => checkClaudeCliAvailable())
  ipcMain.handle('app:getClaudeIntegration', () => getClaudeIntegrationStatus())
  ipcMain.handle('app:getSchedulerStatus', () => getSchedulerStatus())
  ipcMain.handle('app:testNotification', () => testNotification())
  ipcMain.handle('app:getAutoLaunch', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('app:setAutoLaunch', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
  })
  ipcMain.handle('app:uninstall', () => uninstall())
  ipcMain.handle('app:getUpdateStatus', () => getUpdateStatus())
  ipcMain.handle('app:checkForUpdates', () => checkForUpdates())
  ipcMain.handle('app:downloadUpdate', () => downloadUpdate())
  ipcMain.handle('app:installUpdate', () => installUpdate())
  ipcMain.handle('app:setWindowSize', (_e, large: boolean) => {
    resizePopoverWindow(large)
  })
  ipcMain.handle('app:hideWindow', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.hide()
  })
}
