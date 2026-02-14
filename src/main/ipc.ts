import { ipcMain, app } from 'electron'
import * as memory from './db/memory'
import * as tasks from './db/tasks'
import { executeTask } from './scheduler/runner'
import { getConfig, getClaudeConfigPath } from './config'
import { checkClaudeCliAvailable } from '../shared/claude-code'
import { startWatch, stopWatch } from './file-watcher'
import { uninstall } from './uninstall'
import type { CreateTaskInput, CreateWorkerInput } from '../shared/types'

export function registerIpcHandlers(): void {
  // ─── Memory: Entities ───────────────────────────────────

  ipcMain.handle('memory:createEntity', (_e, name: string, type?: string, category?: string) =>
    memory.createEntity(name, type, category)
  )
  ipcMain.handle('memory:getEntity', (_e, id: number) => memory.getEntity(id))
  ipcMain.handle('memory:listEntities', (_e, category?: string) => memory.listEntities(category))
  ipcMain.handle('memory:searchEntities', (_e, query: string) => memory.searchEntities(query))
  ipcMain.handle('memory:deleteEntity', (_e, id: number) => memory.deleteEntity(id))

  // ─── Memory: Observations ─────────────────────────────

  ipcMain.handle('memory:addObservation', (_e, entityId: number, content: string, source?: string) =>
    memory.addObservation(entityId, content, source)
  )
  ipcMain.handle('memory:getObservations', (_e, entityId: number) => memory.getObservations(entityId))
  ipcMain.handle('memory:deleteObservation', (_e, id: number) => memory.deleteObservation(id))

  // ─── Memory: Relations ────────────────────────────────

  ipcMain.handle('memory:addRelation', (_e, fromEntity: number, toEntity: number, relationType: string) =>
    memory.addRelation(fromEntity, toEntity, relationType)
  )
  ipcMain.handle('memory:getRelations', (_e, entityId: number) => memory.getRelations(entityId))
  ipcMain.handle('memory:deleteRelation', (_e, id: number) => memory.deleteRelation(id))

  // ─── Memory: Stats ───────────────────────────────────

  ipcMain.handle('memory:getStats', () => memory.getMemoryStats())

  // ─── Workers ────────────────────────────────────────────

  ipcMain.handle('workers:create', (_e, input: CreateWorkerInput) => tasks.createWorker(input))
  ipcMain.handle('workers:get', (_e, id: number) => tasks.getWorker(id))
  ipcMain.handle('workers:list', () => tasks.listWorkers())
  ipcMain.handle('workers:update', (_e, id: number, updates: Record<string, unknown>) => tasks.updateWorker(id, updates))
  ipcMain.handle('workers:delete', (_e, id: number) => tasks.deleteWorker(id))
  ipcMain.handle('workers:getDefault', () => tasks.getDefaultWorker())

  // ─── Tasks ────────────────────────────────────────────

  ipcMain.handle('tasks:create', (_e, task: CreateTaskInput) => {
    task.triggerConfig = JSON.stringify({ source: 'daymon' })
    return tasks.createTask(task)
  })
  ipcMain.handle('tasks:get', (_e, id: number) => tasks.getTask(id))
  ipcMain.handle('tasks:list', (_e, status?: string) => tasks.listTasks(status))
  ipcMain.handle('tasks:update', (_e, id: number, updates: Record<string, unknown>) => tasks.updateTask(id, updates))
  ipcMain.handle('tasks:delete', (_e, id: number) => tasks.deleteTask(id))
  ipcMain.handle('tasks:pause', (_e, id: number) => tasks.pauseTask(id))
  ipcMain.handle('tasks:resume', (_e, id: number) => tasks.resumeTask(id))
  ipcMain.handle('tasks:getRuns', (_e, taskId: number) => tasks.getTaskRuns(taskId))
  ipcMain.handle('tasks:getLatestRun', (_e, taskId: number) => tasks.getLatestTaskRun(taskId))
  ipcMain.handle('tasks:listAllRuns', (_e, limit: number) => tasks.listAllRuns(limit))
  ipcMain.handle('tasks:runNow', (_e, id: number) => executeTask(id))
  ipcMain.handle('tasks:getRunningRuns', () => tasks.getRunningTaskRuns())

  // ─── Settings ─────────────────────────────────────────

  ipcMain.handle('settings:get', (_e, key: string) => tasks.getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => tasks.setSetting(key, value))
  ipcMain.handle('settings:getAll', () => tasks.getAllSettings())

  // ─── Watches ─────────────────────────────────────────

  ipcMain.handle('watches:create', (_e, path: string, description?: string, actionPrompt?: string) => {
    const watch = tasks.createWatch(path, description, actionPrompt)
    startWatch(watch)
    return watch
  })
  ipcMain.handle('watches:list', (_e, status?: string) => tasks.listWatches(status))
  ipcMain.handle('watches:delete', (_e, id: number) => {
    stopWatch(id)
    tasks.deleteWatch(id)
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
  ipcMain.handle('app:getAutoLaunch', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('app:setAutoLaunch', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
  })
  ipcMain.handle('app:uninstall', () => uninstall())
}
