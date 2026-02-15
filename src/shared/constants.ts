export const APP_NAME = 'Daymon'
export const APP_ID = 'io.daymon.app'

export const DEFAULTS = {
  EXECUTOR: 'claude_code',
  TRIGGER_TYPE: 'cron',
  OBSERVATION_SOURCE: 'claude',
  ENTITY_TYPE: 'fact',
  WINDOW_WIDTH: 480,
  WINDOW_HEIGHT: 600,
  PROGRESS_THROTTLE_MS: 2000
} as const

export const TRIGGER_TYPES = {
  CRON: 'cron',
  ONCE: 'once',
  MANUAL: 'manual'
} as const

export const TASK_STATUSES = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed'
} as const
