import type { SimTuning } from '../sim/SimTuning'
import type { TerrainGenConfig } from '../types/terrain'

export const SAVE_SCHEMA_VERSION = 1

export type WorldPreset =
  | 'Balanced'
  | 'Lush Forest'
  | 'Harsh Desert'
  | 'Volcanic'
  | 'Ice Age'

export type WorldSize = 'S' | 'M' | 'L'

export type WorldProfile = {
  id: string
  name: string
  seed: string
  numericSeed: number
  preset: WorldPreset
  createdAt: number
  terrainConfig: TerrainGenConfig
  config: {
    worldSize: WorldSize
    eventRate: number
    treeDensity: number
    volcanoCount: 0 | 1
    simulationSpeed: number
    enableGeneAgent: boolean
    enableCivs: boolean
    enablePredators: boolean
  }
}

export type WorldStateSerialized = {
  width: number
  height: number
  seed: number
  tick: number
  tilesB64: string
  humidityB64: string
  temperatureB64: string
  fertilityB64: string
  hazardB64: string
  plantBiomassB64: string
  volcano: {
    anchor: { x: number; y: number }
    minIntervalTicks: number
    maxIntervalTicks: number
    maxLavaTiles: number
    nextEruptionTick: number
    activeEruptionId: string | null
  }
  simTuning: SimTuning
}

export type SavePreview = {
  thumbnailDataUrl?: string
  statsSummary: {
    tick: number
    population: number
    biodiversity: number
    avgTemp: number
    avgHumidity: number
    avgHazard: number
    era?: string
  }
}

export type SaveSystemsSnapshot = {
  species: unknown
  phylogeny: unknown
  civs: unknown
  events: unknown
  items: unknown
  structures: unknown
  logs: unknown
  eras: unknown
  metrics: unknown
}

export type WorldSaveRecord = {
  id: string
  slotId: string
  name: string
  createdAt: number
  updatedAt: number
  seed: string
  schemaVersion: number
  profile: WorldProfile
  preview: SavePreview
  state: WorldStateSerialized
  systems: SaveSystemsSnapshot
}

export type SaveSort = 'updatedDesc' | 'nameAsc' | 'seedAsc'

export type WorldSaveListItem = {
  id: string
  slotId: string
  name: string
  updatedAt: number
  createdAt: number
  seed: string
  preview: SavePreview
  schemaVersion: number
}

export type SaveStorage = {
  list(): Promise<WorldSaveRecord[]>
  get(id: string): Promise<WorldSaveRecord | null>
  put(record: WorldSaveRecord): Promise<void>
  delete(id: string): Promise<void>
}

export type SaveManagerConfig = {
  autosaveIntervalSec: number
  maxSlotsPerWorld: number
}

export type SaveWorldInput = {
  worldId: string
  slotId?: string
  name: string
  seed: string
  profile: WorldProfile
  preview: SavePreview
  state: WorldStateSerialized
  systems: SaveSystemsSnapshot
}
