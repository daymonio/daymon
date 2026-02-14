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
  triggerType: string
  triggerConfig: string | null
  scheduledAt: string | null
  executor: string
  status: string
  lastRun: string | null
  lastResult: string | null
  errorCount: number
  maxRuns: number | null
  runCount: number
  memoryEntityId: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  name: string
  description?: string
  prompt: string
  cronExpression?: string
  triggerType?: string
  triggerConfig?: string
  scheduledAt?: string
  executor?: string
  maxRuns?: number
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
