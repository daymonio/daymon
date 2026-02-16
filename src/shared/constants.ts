export const APP_NAME = 'Daymon'
export const APP_ID = 'io.daymon.app'

export const DEFAULTS = {
  EXECUTOR: 'claude_code',
  TRIGGER_TYPE: 'cron',
  OBSERVATION_SOURCE: 'claude',
  ENTITY_TYPE: 'fact',
  WINDOW_WIDTH: 480,
  WINDOW_HEIGHT: 600,
  WINDOW_WIDTH_LARGE: 720,
  WINDOW_HEIGHT_LARGE: 850,
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

export const SETTINGS = {
  NOTIFICATIONS_ENABLED: 'notifications_enabled',
  AUTO_NUDGE_ENABLED: 'auto_nudge_enabled',
  LARGE_WINDOW_ENABLED: 'large_window_enabled'
} as const
