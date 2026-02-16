import type { TRIGGER_TYPES, TASK_STATUSES } from './constants'

// ─── Derived Union Types ──────────────────────────────────

export type TriggerType = typeof TRIGGER_TYPES[keyof typeof TRIGGER_TYPES]
export type TaskStatus = typeof TASK_STATUSES[keyof typeof TASK_STATUSES]

// ─── Worker Types ──────────────────────────────────────────

export interface Worker {
  id: number
  name: string
  systemPrompt: string
  description: string | null
  model: string | null
  isDefault: boolean
  taskCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateWorkerInput {
  name: string
  systemPrompt: string
  description?: string
  model?: string
  isDefault?: boolean
}

// ─── Memory Types ───────────────────────────────────────────

export interface Entity {
  id: number
  name: string
  type: string
  category: string | null
  created_at: string
  updated_at: string
}

export interface Observation {
  id: number
  entity_id: number
  content: string
  source: string
  created_at: string
}

export interface Relation {
  id: number
  from_entity: number
  to_entity: number
  relation_type: string
  created_at: string
}

// ─── Task Types ─────────────────────────────────────────────

export interface Task {
  id: number
  name: string
  description: string | null
  prompt: string
  cronExpression: string | null
  triggerType: TriggerType
  triggerConfig: string | null
  scheduledAt: string | null
  executor: string
  status: TaskStatus
  lastRun: string | null
  lastResult: string | null
  errorCount: number
  maxRuns: number | null
  runCount: number
  memoryEntityId: number | null
  workerId: number | null
  sessionContinuity: boolean
  sessionId: string | null
  timeoutMinutes: number | null
  maxTurns: number | null
  allowedTools: string | null
  disallowedTools: string | null
  learnedContext: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  name: string
  description?: string
  prompt: string
  cronExpression?: string
  triggerType?: TriggerType
  triggerConfig?: string
  scheduledAt?: string
  executor?: string
  maxRuns?: number
  workerId?: number
  sessionContinuity?: boolean
  timeoutMinutes?: number
  maxTurns?: number
  allowedTools?: string
  disallowedTools?: string
}

export interface TaskRun {
  id: number
  taskId: number
  startedAt: string
  finishedAt: string | null
  status: string
  result: string | null
  resultFile: string | null
  errorMessage: string | null
  durationMs: number | null
  progress: number | null
  progressMessage: string | null
  sessionId: string | null
}

// ─── Console Log Types ──────────────────────────────────────

export interface ConsoleLogEntry {
  id: number
  runId: number
  seq: number
  entryType: string
  content: string
  createdAt: string
}

// ─── Watch Types ────────────────────────────────────────────

export interface Watch {
  id: number
  path: string
  description: string | null
  actionPrompt: string | null
  status: string
  lastTriggered: string | null
  triggerCount: number
  createdAt: string
}

// ─── Memory Stats ───────────────────────────────────────────

export interface MemoryStats {
  entityCount: number
  observationCount: number
  relationCount: number
}
