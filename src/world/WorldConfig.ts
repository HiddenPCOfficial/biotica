import { DEFAULT_WORLD_CHUNK_SIZE, MAX_RECENT_WORLD_EVENTS } from '../shared/constants'

export type VolcanoRuntimeConfig = {
  minIntervalTicks: number
  maxIntervalTicks: number
  maxLavaTiles: number
}

export type WorldRuntimeConfig = {
  chunkSize: number
  maxRecentEvents: number
  volcano: VolcanoRuntimeConfig
}

export const DEFAULT_WORLD_RUNTIME_CONFIG: Readonly<WorldRuntimeConfig> = {
  chunkSize: DEFAULT_WORLD_CHUNK_SIZE,
  maxRecentEvents: MAX_RECENT_WORLD_EVENTS,
  volcano: {
    minIntervalTicks: 8000,
    maxIntervalTicks: 16000,
    maxLavaTiles: 180,
  },
}
