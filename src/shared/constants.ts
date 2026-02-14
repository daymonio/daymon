export const APP_NAME = 'Daymon'
export const APP_ID = 'io.daymon.app'

export const IPC_CHANNELS = {
  // Memory
  MEMORY_CREATE_ENTITY: 'memory:createEntity',
  MEMORY_GET_ENTITY: 'memory:getEntity',
  MEMORY_LIST_ENTITIES: 'memory:listEntities',
  MEMORY_SEARCH_ENTITIES: 'memory:searchEntities',
  MEMORY_DELETE_ENTITY: 'memory:deleteEntity',
  MEMORY_ADD_OBSERVATION: 'memory:addObservation',
  MEMORY_GET_OBSERVATIONS: 'memory:getObservations',
  MEMORY_DELETE_OBSERVATION: 'memory:deleteObservation',
  MEMORY_ADD_RELATION: 'memory:addRelation',
  MEMORY_GET_RELATIONS: 'memory:getRelations',
  MEMORY_DELETE_RELATION: 'memory:deleteRelation',

  // Tasks
  TASKS_CREATE: 'tasks:create',
  TASKS_GET: 'tasks:get',
  TASKS_LIST: 'tasks:list',
  TASKS_UPDATE: 'tasks:update',
  TASKS_DELETE: 'tasks:delete',
  TASKS_PAUSE: 'tasks:pause',
  TASKS_RESUME: 'tasks:resume',
  TASKS_GET_RUNS: 'tasks:getRuns',
  TASKS_GET_LATEST_RUN: 'tasks:getLatestRun',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:getAll',

  // App
  APP_GET_VERSION: 'app:getVersion',
  APP_QUIT: 'app:quit'
} as const

export const DEFAULTS = {
  EXECUTOR: 'claude_code',
  TRIGGER_TYPE: 'cron',
  OBSERVATION_SOURCE: 'claude',
  ENTITY_TYPE: 'fact',
  WINDOW_WIDTH: 400,
  WINDOW_HEIGHT: 600
} as const
