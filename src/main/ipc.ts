import { ipcMain, app } from 'electron'
import * as memory from './db/memory'
import * as tasks from './db/tasks'
import type { CreateTaskInput } from '../shared/types'

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

  // ─── Tasks ────────────────────────────────────────────

  ipcMain.handle('tasks:create', (_e, task: CreateTaskInput) => tasks.createTask(task))
  ipcMain.handle('tasks:get', (_e, id: number) => tasks.getTask(id))
  ipcMain.handle('tasks:list', (_e, status?: string) => tasks.listTasks(status))
  ipcMain.handle('tasks:update', (_e, id: number, updates: Record<string, unknown>) => tasks.updateTask(id, updates))
  ipcMain.handle('tasks:delete', (_e, id: number) => tasks.deleteTask(id))
  ipcMain.handle('tasks:pause', (_e, id: number) => tasks.pauseTask(id))
  ipcMain.handle('tasks:resume', (_e, id: number) => tasks.resumeTask(id))
  ipcMain.handle('tasks:getRuns', (_e, taskId: number) => tasks.getTaskRuns(taskId))
  ipcMain.handle('tasks:getLatestRun', (_e, taskId: number) => tasks.getLatestTaskRun(taskId))

  // ─── Settings ─────────────────────────────────────────

  ipcMain.handle('settings:get', (_e, key: string) => tasks.getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => tasks.setSetting(key, value))
  ipcMain.handle('settings:getAll', () => tasks.getAllSettings())

  // ─── App ──────────────────────────────────────────────

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:quit', () => app.quit())
}
