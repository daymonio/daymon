import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { CreateTaskInput, CreateWorkerInput } from '../shared/types'

const api = {
  memory: {
    createEntity: (name: string, type?: string, category?: string) =>
      ipcRenderer.invoke('memory:createEntity', name, type, category),
    getEntity: (id: number) => ipcRenderer.invoke('memory:getEntity', id),
    listEntities: (category?: string) => ipcRenderer.invoke('memory:listEntities', category),
    searchEntities: (query: string) => ipcRenderer.invoke('memory:searchEntities', query),
    deleteEntity: (id: number) => ipcRenderer.invoke('memory:deleteEntity', id),
    addObservation: (entityId: number, content: string, source?: string) =>
      ipcRenderer.invoke('memory:addObservation', entityId, content, source),
    getObservations: (entityId: number) => ipcRenderer.invoke('memory:getObservations', entityId),
    deleteObservation: (id: number) => ipcRenderer.invoke('memory:deleteObservation', id),
    addRelation: (fromEntity: number, toEntity: number, relationType: string) =>
      ipcRenderer.invoke('memory:addRelation', fromEntity, toEntity, relationType),
    getRelations: (entityId: number) => ipcRenderer.invoke('memory:getRelations', entityId),
    deleteRelation: (id: number) => ipcRenderer.invoke('memory:deleteRelation', id),
    getStats: () => ipcRenderer.invoke('memory:getStats')
  },

  workers: {
    create: (input: CreateWorkerInput) =>
      ipcRenderer.invoke('workers:create', input),
    get: (id: number) => ipcRenderer.invoke('workers:get', id),
    list: () => ipcRenderer.invoke('workers:list'),
    update: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('workers:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('workers:delete', id),
    getDefault: () => ipcRenderer.invoke('workers:getDefault'),
    count: () => ipcRenderer.invoke('workers:count') as Promise<number>
  },

  tasks: {
    create: (task: CreateTaskInput) => ipcRenderer.invoke('tasks:create', task),
    get: (id: number) => ipcRenderer.invoke('tasks:get', id),
    list: (status?: string) => ipcRenderer.invoke('tasks:list', status),
    update: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('tasks:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),
    pause: (id: number) => ipcRenderer.invoke('tasks:pause', id),
    resume: (id: number) => ipcRenderer.invoke('tasks:resume', id),
    getRuns: (taskId: number) => ipcRenderer.invoke('tasks:getRuns', taskId),
    getLatestRun: (taskId: number) => ipcRenderer.invoke('tasks:getLatestRun', taskId),
    listAllRuns: (limit?: number) => ipcRenderer.invoke('tasks:listAllRuns', limit ?? 20),
    runNow: (id: number) => ipcRenderer.invoke('tasks:runNow', id),
    getRunningRuns: () => ipcRenderer.invoke('tasks:getRunningRuns'),
    getConsoleLogs: (runId: number, afterSeq?: number, limit?: number) =>
      ipcRenderer.invoke('tasks:getConsoleLogs', runId, afterSeq, limit)
  },

  watches: {
    create: (path: string, description?: string, actionPrompt?: string) =>
      ipcRenderer.invoke('watches:create', path, description, actionPrompt),
    list: (status?: string) => ipcRenderer.invoke('watches:list', status),
    delete: (id: number) => ipcRenderer.invoke('watches:delete', id),
    pause: (id: number) => ipcRenderer.invoke('watches:pause', id),
    resume: (id: number) => ipcRenderer.invoke('watches:resume', id),
    count: (status?: string) => ipcRenderer.invoke('watches:count', status) as Promise<number>
  },

  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    quit: () => ipcRenderer.invoke('app:quit'),
    getPaths: () => ipcRenderer.invoke('app:getPaths'),
    checkClaude: () => ipcRenderer.invoke('app:checkClaude'),
    getClaudeIntegration: () => ipcRenderer.invoke('app:getClaudeIntegration'),
    getSchedulerStatus: () => ipcRenderer.invoke('app:getSchedulerStatus'),
    testNotification: () => ipcRenderer.invoke('app:testNotification'),
    getAutoLaunch: () => ipcRenderer.invoke('app:getAutoLaunch'),
    setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
    uninstall: () => ipcRenderer.invoke('app:uninstall'),
    hideWindow: () => ipcRenderer.invoke('app:hideWindow'),
    getUpdateStatus: () => ipcRenderer.invoke('app:getUpdateStatus'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    simulateUpdate: () => ipcRenderer.invoke('app:simulateUpdate'),
    setWindowSize: (large: boolean) => ipcRenderer.invoke('app:setWindowSize', large),
    openFile: (filePath: string) => ipcRenderer.invoke('app:openFile', filePath),
    showInFolder: (filePath: string) => ipcRenderer.invoke('app:showInFolder', filePath),
    sendToApp: (target: string, message: string, filePath?: string) => ipcRenderer.invoke('app:sendToApp', target, message, filePath),
    requestAccessibility: () => ipcRenderer.invoke('app:requestAccessibility') as Promise<boolean>
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
