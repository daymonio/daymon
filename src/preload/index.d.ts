import { ElectronAPI } from '@electron-toolkit/preload'
import type { Entity, Observation, Relation, Task, TaskRun, Watch, CreateTaskInput, MemoryStats, Worker, CreateWorkerInput, ConsoleLogEntry } from '../shared/types'

interface MemoryAPI {
  createEntity: (name: string, type?: string, category?: string) => Promise<Entity>
  getEntity: (id: number) => Promise<Entity | null>
  listEntities: (category?: string) => Promise<Entity[]>
  searchEntities: (query: string) => Promise<Entity[]>
  deleteEntity: (id: number) => Promise<void>
  addObservation: (entityId: number, content: string, source?: string) => Promise<Observation>
  getObservations: (entityId: number) => Promise<Observation[]>
  deleteObservation: (id: number) => Promise<void>
  addRelation: (fromEntity: number, toEntity: number, relationType: string) => Promise<Relation>
  getRelations: (entityId: number) => Promise<Relation[]>
  deleteRelation: (id: number) => Promise<void>
  getStats: () => Promise<MemoryStats>
}

interface TasksAPI {
  create: (task: CreateTaskInput) => Promise<Task>
  get: (id: number) => Promise<Task | null>
  list: (status?: string) => Promise<Task[]>
  update: (id: number, updates: Record<string, unknown>) => Promise<void>
  delete: (id: number) => Promise<void>
  pause: (id: number) => Promise<void>
  resume: (id: number) => Promise<void>
  getRuns: (taskId: number) => Promise<TaskRun[]>
  getLatestRun: (taskId: number) => Promise<TaskRun | null>
  listAllRuns: (limit?: number) => Promise<TaskRun[]>
  runNow: (id: number) => Promise<void>
  getRunningRuns: () => Promise<TaskRun[]>
  getConsoleLogs: (runId: number, afterSeq?: number, limit?: number) => Promise<ConsoleLogEntry[]>
}

interface WatchesAPI {
  create: (path: string, description?: string, actionPrompt?: string) => Promise<Watch>
  list: (status?: string) => Promise<Watch[]>
  delete: (id: number) => Promise<void>
  count: (status?: string) => Promise<number>
}

interface SettingsAPI {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  getAll: () => Promise<Record<string, string>>
}

interface AppAPI {
  getVersion: () => Promise<string>
  quit: () => Promise<void>
  getPaths: () => Promise<{ dbPath: string; resultsDir: string; dataDir: string; claudeConfigPath: string }>
  checkClaude: () => Promise<{ available: boolean; version?: string; error?: string }>
  getClaudeIntegration: () => Promise<{
    claudeDesktop: { configured: boolean; configPath: string }
    claudeCode: { configured: boolean; configPath: string }
  }>
  getSchedulerStatus: () => Promise<{ running: boolean; jobCount: number; jobs: Array<{ taskId: number }> }>
  testNotification: () => Promise<{ shown: boolean; reason?: string }>
  getAutoLaunch: () => Promise<boolean>
  setAutoLaunch: (enabled: boolean) => Promise<void>
  uninstall: () => Promise<void>
  hideWindow: () => Promise<void>
  getUpdateStatus: () => Promise<{ status: string; version?: string; progress?: number; error?: string }>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  setWindowSize: (large: boolean) => Promise<void>
}

interface WorkersAPI {
  create: (input: CreateWorkerInput) => Promise<Worker>
  get: (id: number) => Promise<Worker | null>
  list: () => Promise<Worker[]>
  update: (id: number, updates: Record<string, unknown>) => Promise<void>
  delete: (id: number) => Promise<void>
  getDefault: () => Promise<Worker | null>
  count: () => Promise<number>
}

interface DaymonAPI {
  memory: MemoryAPI
  workers: WorkersAPI
  tasks: TasksAPI
  watches: WatchesAPI
  settings: SettingsAPI
  app: AppAPI
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DaymonAPI
  }
}
